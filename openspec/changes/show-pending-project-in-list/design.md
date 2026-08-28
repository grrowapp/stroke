## Context

動機は proposal.md の Why を参照。ここでは approach を決めるのに要る現状だけを置く。

**承認の実体。** `approve.post.ts` は「衝突確認 → phase を `approved` に書く → セッションディレクトリをプロジェクト名へ改名 → U13 を叩いて steering を起こす」を行う。改名は同じ親（`projectShareRoot`）の下で起きるため、**保存先には uuid のセッションとプロジェクト名のディレクトリが並ぶ**。

**一覧の母集合。** `GET /api/projects` は `scanProjects(projectsParentPath)` で `.spec-workflow` を持つディレクトリだけを拾い、registry と突き合わせて `buildProjectDirectory` が組む。生成中のものはこの網に掛からない。

**生成中を知る材料は既に在る。** `listSessionsCore(root)` が保存先の直下を列挙し、各件の `phase`（`stroking` / `proposed` / `approved` / `unknown`）と `invocation`（`idle` / `running` / `failed` / `error`）と `path` を返す。昇格したプロジェクトも「名前が uuid でないセッション」としてそのまま載り続ける（`session-core.ts` のコメントが、巡回のために意図してそうしていると書いている）。

**`invocation` の書き込み口は1つ。** `ai.ts` のコメントいわく「`invocation` の書き込みはすべて `setInvocation`（A8）を通る」。起動で `running`、完了で `idle`、時間切れで `failed`。

**WS は2体系。** 現状と、割れているのが増やし方だけであることは proposal.md の表を参照。

**ライブラリの軸。** `docs/specs/plan/components-library-replacement.md` は「@nuxt/ui (4.10.0) / @vueuse/core (14.4.0) / Nuxt 標準機能で代替できるものは置き換える」を軸に置いている。新しい依存を足すには、この3つで賄えないことを示す必要がある。

## Goals / Non-Goals

**Goals:**

- 生成中・完了・失敗を、**新しい保存も新しい判定も作らずに**、既に在る記録から導く
- WS の口を増やさずに配信する。そのために、増やし方の規約を実装として成立させる
- 一覧の行の内容について、正を1つに保つ

**Non-Goals:**

- ストローク側 W1 / W2 の振る舞いを変えること。束ね方の実装は共通化するが、口と配信内容は不変
- 完了の検知精度を上げること。判定は既存のものをそのまま使い、取りこぼしを埋める作り込みをしない（specs `project/generation`）
- 祝いの寸法・速度の最終値を決めること。実物を出して合わせる（Open Questions）

## Decisions

### D1. 生成中の母集合は `listSessionsCore` から導き、名前で走査結果に重ねる

`GET /api/projects` が `scanProjects` と `readRegistry` に加えて `listSessionsCore(projectShareRoot)` を呼ぶ。`phase === 'approved'` の件を生成中の候補とし、**ディレクトリ名**で走査結果に重ねる。

- 走査に出ていない → 生成中の行として母集合に加える
- 走査に出ている → 走査側の行を使う。ただし D7 の優先規則に従う

**キーが `workflowRootPath` ではなく名前である理由。** 生成中のプロジェクトは `.spec-workflow` を持たないので `workflowRootPath` が定まらない。`projectShareRoot` の直下1階層という配置は走査もセッション列挙も同じなので、名前は一意である。

*代替案*: `scanProjects` 自体を「`.spec-workflow` を持つか、`state.json` を持つか」に広げる。採らない。走査は「本家が読むプロジェクトを見つける」ためのもので、そこにセッションの都合を混ぜると、走査の意味が2つになる。

*代替案*: 承認時に生成中の台帳を書く。採らない。`project/directory` の「一覧を永続化しない」に反する。

### D2. `ProjectSummary` に `creation` を1つ足す。`connection` の union は広げない

```ts
export type ProjectCreation = 'done' | 'in-progress' | 'failed';
```

`creation` が `'done'` 以外のとき、`connection` は `'disconnected'`、`projectId` / `pid` / `lastModified` / `pendingApprovals` はすべて `null` とする。

**`connection` を広げない理由。** 接続しているかと、作り終わっているかは別の軸である。1つに畳むと「未接続」が2つの意味を持つ。分けておけば、既存の `connection === 'active'` を見ている箇所（入場可否・PID 表示・承認件数の問い合わせ）は**そのまま正しいまま**になる——生成中のものが `'active'` になることはないためである。

*代替案*: `ProjectSummary` を判別可能 union に割る。採らない。既存の参照がすべて書き換えになる割に、得るのは型の厳密さだけである。

### D3. 一覧の行の正は `GET /api/projects` のまま。WS は「取り直せ」の合図と祝いの引き金

WS のメッセージに行の中身を載せない。画面は生成の出来事を受け取ったら `refreshNuxtData` で `/api/projects` を取り直す。

**行の中身を WS に載せない理由。** 載せると同じ一覧に2つの正（初回の `useFetch` と WS の差分）ができ、両者がずれたときにどちらが本当かを決める規則が要る。合図だけにすれば正は1つのままで、`pendingApprovalsKey` で既に使っている取り直しの手（`refreshNuxtData`）にも揃う。

**取り直しは定期実行ではない。** 出来事が起きたときだけ走る。`tech.md` の Performance Requirements と `upstream-connection` の「定期ポーリングで取りに行かない」を破らない。

### D4. `BoardMessage` に1種類だけ足す。`snapshot` には何も足さない

```ts
| { type: 'project-creation'; name: string; state: ProjectCreation }
```

**`snapshot` に生成中の一覧を足さない**（実装中に、当初案が不要だと判明）。

当初は「接続より前に完了していたものを祝わないため」に `creating: string[]` を載せる案だった。しかし**接続より前に完了したものは、接続後にイベントを出さない**。祝いはイベントを受けたときだけ出るので、抑止するものが最初から存在しない。載せても何も守らない。

代わりに **`snapshot` を受けたら一覧を取り直す**。これで再接続の間に起きた変化（生成が始まった・終わった）が揃う。祝いは出さない——`snapshot` は現在分であって、完了の瞬間ではないためである。

この形は `notification` と `snapshot` の関係とそのまま同じで、`useBoardSocket` の `onNotification` が既に持っている（snapshot ではイベントを発火しない）。

`snapshot()` を同期のまま保てるという副次的な利点もある。載せていたら、接続のたびに保存先を読みに行くことになっていた。

### D5. broadcast の起点は2箇所だけ

| 起点 | 送るもの |
|---|---|
| `approve.post.ts` の昇格成功の直後 | `state: 'in-progress'` |
| `ai.ts` の `setInvocation`（A8） | `idle` → `'done'` / `error` → `'failed'` |

`setInvocation` はストロークのセッション（uuid）でも呼ばれる。**`phase === 'approved'` のときだけ送る。** それ以外は上層に関係がない。

`failed`（リトライ待ち）では送らない。仕様上「失敗として見せる」のは終端の `error` だけであり、巡回で起き直るものを失敗として見せると、勝手に直る行ができる。

**`setInvocation` に寄せる理由。** `ai.ts` のコメントが明言しているとおり、`invocation` の書き込みはここを必ず通る。ここに置けば、書いたのに配信しない経路が生まれない。

### D6. WS の束ね方を1つの実装に寄せ、`server/utils/ws/` に置く

`ws-channels.ts` の `createRegistry()` と `board.ts` の `peers: Set<Peer>` は、キーを持つか持たないかの違いしかない。1つの実装に畳み、`server/utils/ws/registry.ts` に置く。

- ストローク側: セッション id をキーに持つ registry（今と同じ振る舞い）
- board 側: キーを持たない registry（今と同じ振る舞い）

**`stroke/` にも `control/` にも置かない理由。** 両方から使うため、片方に置くともう片方が相手の領分へ依存する。`docs/specs/core/system-structure.md` の区切りに新しい越境を作らない。

振る舞いは変えない。**W1 / W2 の口も配信内容も不変で、これは実装の統合だけである**（specs で `api/session/ws` を変えていないのはこのため）。

### D7. 生成中の判定は「走査に出るか」と「`invocation`」の2つを合わせる

**`invocation` だけでは判定できない**（実装中に判明）。`'idle'` は次の2つの意味を持つ。

- **昇格した直後、まだ steering が起きていない** — `approve.post.ts` が `idle` を書いてから U13 を叩き、U13 が `running` に変える。その間の数ミリ秒
- **steering が終わった** — `setInvocation` が `running` から戻したもの

`state.json` の値だけを見ると両者を区別できず、`'idle'` を生成中と読むと**完了した行が永久に生成中のまま**になる。判定は走査の結果と合わせる。

| 走査（`.spec-workflow`） | `invocation` | 結果 |
|---|---|---|
| 無し | 何であれ（`error` を除く） | **生成中** |
| 在り | `running` | **生成中**（steering がまだ書いている） |
| 在り | `idle` / `failed` | **完了**（通常のプロジェクト） |
| — | `error` | **作成に失敗** |

`.spec-workflow` が在って `running` の間を生成中に留めるのは、一覧に載った瞬間に押せてしまうと、まだ steering が書き終えていない中身に入ることになるためである。ユーザーが「完了の判定はラフでよい」と述べているのは、**遅れる方向のラフさ**として受ける。早く出して空を見せる方向には倒さない。

判定の場所は `buildProjectDirectory` の1箇所とする。`listPromotedProjects`（`control/creating.ts`）は `state.json` から読んだ事実だけを返し、走査と突き合わせない。

### D8. 祝いは `canvas-confetti` を足して実現する

- **@nuxt/ui には相当が無い。** `UToast` は 1行のテキストに限る形で、`notification-toast` の仕様がそれを固定している。行より大きく出す・弾ける、のいずれも満たせない
- **@vueuse/core にも Nuxt 標準にも無い**
- `canvas-confetti` は依存を持たず小さい。ブラウザ専用なので**クライアント側で動的 import** し、SSR に載せない

ユーザーは「クラッカーを鳴らすようなアニメーションのモジュールでいいものがあれば、それを使うのが一番いい」と述べている。自前のパーティクル実装は、保守する対象が増えるだけで、この方針に反する。

メッセージ本体（名前と文言の面）は @nuxt/ui のコンポーネントで組み、confetti はその上に重ねる。

### D9. `replace-polling-with-push` はこの change の後に回し、W3 を口ではなくメッセージ型にする

あちらは失敗の配信のために `/api/strokes/:id/ws/failure` という4本目の口を立てる計画で、`ws/delivery` の「新しい種類の出来事のために配信の口を増やさない」に正面から反する。同じ相手（1つのセッションを見ている画面）へ届く出来事が1つ増えるだけなので、W1 / W2 のいずれかにメッセージ種別を足す形になる。

あちらは 0/30 で未着手なので、書き換えの費用は今なら小さい。

### D10. `notification-feed` の spec は変えない

board WS にメッセージ種別が1つ増えるが、`notification-feed` の7つの要件はいずれも**通知そのもの**（4種に限る・前回値との比較で作る・接続直後は出さない・永続化しない・横断で並べる・行から直行・件数の上限）を規定しており、その WS が他に何を運ぶかには触れていない。生成の配信は通知ではないため、どの要件も破らない。proposal の Impact に「前提が変わる」と書いたのは調べる前の記述で、実際には delta は不要である。

## Risks / Trade-offs

**board WS の意味が広がる** → 今まで `UpstreamMonitor` 由来だけだった口に、自前の出来事が乗る。「本家の中継」という理解でコードを読む人が混乱しうる。→ `board.ts` の冒頭コメントを「上層へのサーバー発イベントの口」に書き換え、`ws/delivery` の spec からその規約を辿れるようにする。

**`GET /api/projects` の仕事が1つ増える** → 走査・registry・承認件数の問い合わせに加えてセッション列挙が乗る。列挙は保存先直下の `readdir` と各件の `state.json` 読みで、走査と同じ規模である。→ 走査と並列に走らせる（既に `Promise.all` の形になっている）。

**祝いを取りこぼす** → WS が切れている間に完了すると、張り直し時の snapshot では既に完了済みとして届き、祝いは出ない。→ **仕様どおりである**（`project/generation` の「完了の瞬間を受け取った画面に対して一度」）。完了の表示自体は取り直しで必ず正しくなる。

**新しい依存が1つ増える** → `canvas-confetti`。→ ライブラリの軸（@nuxt/ui / @vueuse / Nuxt 標準）で賄えないことを D8 に示した。クライアント側の動的 import に限り、サーバのバンドルに載せない。

**束ね方の統合で W1 / W2 を壊す** → 実装の差し替えは振る舞いを変えない前提だが、接続の登録漏れは無言で配信が止まる形で出る。→ `ws-channels` の既存テストを統合後の実装に対して通す。加えて `yarn check:ws-disconnect`（既存スクリプト）を通す。

**`replace-polling-with-push` との衝突** → あちらを先に着手されると、規約に反する4本目の口が生える。→ D9 を proposal と design の両方に書いた。あちらの proposal にも追記する（tasks に入れる）。

## Migration Plan

段階的な移行は不要である。既存のデータ形式も保存先も変わらず、`ProjectSummary` の追加フィールドは既存の行では `'done'` に定まる。ロールバックはコードを戻すだけで、残留物は無い。

## Open Questions

- **祝いの具体値**（現れてから引くまでの時間、面の寸法、confetti の粒の量）。実物を動かして合わせる。仕様が定めているのは満たすべき質感だけで、値が変わっても specs は変わらない
- **`prefers-reduced-motion` の下での見せ方。** confetti を止めてメッセージだけ出すのが順当だが、明滅とローダーをどこまで落とすかは実物を見て決める
