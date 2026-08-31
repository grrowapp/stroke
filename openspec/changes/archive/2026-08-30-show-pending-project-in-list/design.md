## Context

動機は proposal.md の Why を参照。ここでは approach を決めるのに要る現状だけを置く。

**承認の実体。** `approve.post.ts` は「衝突確認 → セッションディレクトリをプロジェクト名へ改名 → phase を `approved` に書く → U13 を叩いて steering を起こす」を行う。改名は同じ親（`projectShareRoot`）の下で起きるため、**保存先には uuid のセッションとプロジェクト名のディレクトリが並ぶ**。

**一覧の母集合。** `GET /api/projects` は `scanProjects(projectsParentPath)` で `.spec-workflow` を持つディレクトリだけを拾い、registry と突き合わせて `buildProjectDirectory` が組む。生成中のものはこの網に掛からない。

**生成中を知る材料は既に在る。** 保存先の直下には昇格したプロジェクトのディレクトリがそのまま並び、その `state.json` は `phase: 'approved'` を持つ。改名は同じ親の下で起きるので、承認した瞬間からこの形になっている。新しい記録を書かずに、これだけで「昇格したが `.spec-workflow` をまだ持たないもの」を数え上げられる。

**`invocation` の書き込み口は1つ。** `ai.ts` のコメントいわく「`invocation` の書き込みはすべて `writeInvocation`（A8）を通る」。起動で `running`、完了で `idle`、時間切れで `failed`。**ただしこれは `state.json` に残る永続値で、時間切れの見張りはプロセス内にしかない**——サーバーが落ちると `running` のまま誰も戻さない。判定の材料としては信用できず、合図の起点としてだけ使える（D5・D7）。

**WS は2体系。** 現状と、割れているのが増やし方だけであることは proposal.md の表を参照。

**ライブラリの軸。** `docs/specs/plan/components-library-replacement.md` は「@nuxt/ui (4.10.0) / @vueuse/core (14.4.0) / Nuxt 標準機能で代替できるものは置き換える」を軸に置いている。新しい依存を足すには、この3つで賄えないことを示す必要がある。

## Goals / Non-Goals

**Goals:**

- 生成中と完了を、**新しい保存も新しい判定も作らずに**、既に在るファイルシステムの事実から導く
- WS の口を増やさずに配信する。そのために、増やし方の規約を実装として成立させる
- 一覧の行の内容について、正を1つに保つ
- 決着（成功・失敗）を、**一覧の行としてではなく1つのモーダル**で片付ける

**Non-Goals:**

- ストローク側 W1 / W2 の振る舞いを変えること。束ね方の実装は共通化するが、口と配信内容は不変
- 完了の検知精度を上げること。判定はファイルシステムの事実だけで行い、取りこぼしを埋める作り込みをしない（specs `project/generation`）
- 一覧に「作成に失敗」の状態を持つこと。失敗はモーダルで決着し、行として居座らない
- 決着のモーダルの寸法・演出の最終値を決めること。実物を出して合わせる（Open Questions）

## Decisions

### D1. 生成中の母集合は `state.json` の `phase` から導き、名前で走査結果に重ねる

`GET /api/projects` が `scanProjects` と `readRegistry` に加えて `listPromotedProjects(projectShareRoot)`（`server/utils/control/creating.ts`）を呼ぶ。保存先の直下を列挙し、`state.json` の `phase === 'approved'` を持つものを昇格した候補とし、**ディレクトリ名**で走査結果に重ねる。

- 走査に出ていない → 生成中の行として母集合に加える
- 走査に出ている → 走査側の行を使う。完了である（D7）

**`listSessionsCore` に相乗りしない。** あれは巡回のための一覧で、`openspec/` の存在と `config.yaml` の中身まで検査する。母集合の判定にその検査を持ち込むと、openspec が壊れたプロジェクトが一覧から丸ごと消える。ここで要るのは `phase` だけである。

**キーが `workflowRootPath` ではなく名前である理由。** 生成中のプロジェクトは `.spec-workflow` を持たないので `workflowRootPath` が定まらない。`projectShareRoot` の直下1階層という配置は走査も昇格分の列挙も同じなので、名前は一意である。

*代替案*: `scanProjects` 自体を「`.spec-workflow` を持つか、`state.json` を持つか」に広げる。採らない。走査は「本家が読むプロジェクトを見つける」ためのもので、そこにセッションの都合を混ぜると、走査の意味が2つになる。

*代替案*: 承認時に生成中の台帳を書く。採らない。`project/directory` の「一覧を永続化しない」に反する。

### D2. `ProjectSummary` に `creation` を1つ足す。`connection` の union は広げない

**行の型と配信の型を分ける。**

```ts
/** 行が持つ状態。失敗は行として残らない */
export type ProjectCreation = 'done' | 'in-progress';
/** 配信が運ぶ決着。失敗はモーダルの引き金として要る */
export type ProjectCreationOutcome = ProjectCreation | 'failed';
```

`ProjectSummary.creation` は2値である。**一覧に「作成に失敗」の状態を持たない**——失敗はモーダルで決着し、やり直せば生成中に戻り、破棄すれば行が消える。失敗したまま居座る行が生まれないので、行の状態は アクティブ / 未接続 / 生成中 の3つで足りる。

一方、決着そのものとして失敗は起きる。それを画面へ知らせる引き金が要るので、**配信の型だけが失敗を運ぶ**（D4）。

`creation` が `'in-progress'` のとき、`connection` は `'disconnected'`、`pid` / `lastModified` / `pendingApprovals` は `null` とする。`projectId` だけは導出して入れる（D13）。

**`connection` を広げない理由。** 接続しているかと、作り終わっているかは別の軸である。1つに畳むと「未接続」が2つの意味を持つ。分けておけば、既存の `connection === 'active'` を見ている箇所（入場可否・PID 表示・承認件数の問い合わせ）は**そのまま正しいまま**になる——生成中のものが `'active'` になることはないためである。

*代替案*: `ProjectSummary` を判別可能 union に割る。採らない。既存の参照がすべて書き換えになる割に、得るのは型の厳密さだけである。

### D3. 一覧の行の正は `GET /api/projects` のまま。WS は「取り直せ」の合図と決着のモーダルの引き金

WS のメッセージに行の中身を載せない。画面は生成の出来事を受け取ったら `refreshNuxtData` で `/api/projects` を取り直す。

**行の中身を WS に載せない理由。** 載せると同じ一覧に2つの正（初回の `useFetch` と WS の差分）ができ、両者がずれたときにどちらが本当かを決める規則が要る。合図だけにすれば正は1つのままで、`pendingApprovalsKey` で既に使っている取り直しの手（`refreshNuxtData`）にも揃う。

**取り直しは定期実行ではない。** 出来事が起きたときだけ走る。`tech.md` の Performance Requirements と `upstream-connection` の「定期ポーリングで取りに行かない」を破らない。

### D4. `BoardMessage` に1種類だけ足す。`snapshot` には何も足さない

```ts
| { type: 'project-creation'; name: string; state: ProjectCreationOutcome }
```

運ぶ値は `ProjectCreationOutcome`（`'in-progress' | 'done' | 'failed'`）である。行の型（2値）ではない——失敗は行として残らないが、決着としては起きるためである（D2）。

**`snapshot` に生成中の一覧を足さない**（実装中に、当初案が不要だと判明）。

当初は「接続より前に決着していたものにモーダルを出さないため」に `creating: string[]` を載せる案だった。しかし**接続より前に決着したものは、接続後にイベントを出さない**。モーダルはイベントを受けたときだけ出るので、抑止するものが最初から存在しない。載せても何も守らない。

代わりに **`snapshot` を受けたら一覧を取り直す**。これで再接続の間に起きた変化（生成が始まった・終わった）が揃う。モーダルは出さない——`snapshot` は現在分であって、決着の瞬間ではないためである。

この形は `notification` と `snapshot` の関係とそのまま同じで、`useBoardSocket` の `onNotification` が既に持っている（snapshot ではイベントを発火しない）。

`snapshot()` を同期のまま保てるという副次的な利点もある。載せていたら、接続のたびに保存先を読みに行くことになっていた。

### D5. broadcast の起点は2箇所だけ。流すのは合図であって、行の状態ではない

| 起点 | 送るもの |
|---|---|
| `approve.post.ts` の昇格成功の直後 | `state: 'in-progress'` |
| `session-store.ts` の `writeInvocation`（A8） | `idle` → `'done'` / `error` → `'failed'` |

**`invocation` を合図の材料に使うが、行の判定には使わない。** 行が生成中か完了かは、受け取った側が `/api/projects` を取り直し、サーバーがファイルシステムから毎回導く（D3・D7）。WS が運ぶのは「決着したから取り直せ」と、決着のモーダルを出す引き金だけである。この分担のおかげで、合図が遅れても取りこぼしても**行の表示は次の取り直しで必ず正しくなる**——`invocation` が `running` のまま残るような壊れ方をしても、それが行に伝染しない。

`writeInvocation` はストロークのセッション（uuid）でも呼ばれる。**`phase === 'approved'` のときだけ送る。** それ以外は上層に関係がない。

`failed`（リトライ待ち）では送らない。巡回が起き直す途中であり、決着ではない。終端は `error` だけである。

**`writeInvocation` に寄せる理由。** `ai.ts` のコメントが明言しているとおり、`invocation` の書き込みはここを必ず通る。ここに置けば、書いたのに配信しない経路が生まれない。

**判定は `creationOutcomeOf` として切り出す。** phase と `invocation` だけを受け取り、流すものが無ければ `null` を返す純粋な関数である。書き込みの副作用と混ぜると、条件を確かめるのに保存先と Nitro の設定が要る。

*代替案*: `.spec-workflow/` の出現を見張って完了を送る。採らない。新しい見張りの仕組みが要るうえ、失敗（永久に出現しない）の終わらせ方を別に決めることになる。`writeInvocation` は既に在る通り道である。

### D6. WS の束ね方を1つの実装に寄せ、`server/utils/ws/` に置く

`ws-channels.ts` の `createRegistry()` と `board.ts` の `peers: Set<Peer>` は、キーを持つか持たないかの違いしかない。1つの実装に畳み、`server/utils/ws/registry.ts` に置く。

- ストローク側: セッション id をキーに持つ registry（今と同じ振る舞い）
- board 側: キーを持たない registry（今と同じ振る舞い）

**`stroke/` にも `control/` にも置かない理由。** 両方から使うため、片方に置くともう片方が相手の領分へ依存する。`docs/specs/core/system-structure.md` の区切りに新しい越境を作らない。

振る舞いは変えない。**W1 / W2 の口も配信内容も不変で、これは実装の統合だけである**（specs で `api/session/ws` を変えていないのはこのため）。

### D7. 生成中の判定はファイルシステムの事実だけで行う

| `state.json` の `phase` | 走査（`.spec-workflow/`） | 結果 |
|---|---|---|
| `approved` | 無し | **生成中** |
| `approved` | 在り | **完了**（通常のプロジェクト） |

これだけである。**`invocation` は見ない。**

理由は2つある。

- **`invocation` は信用できない。** `state.json` に残る永続値なのに、時間切れの見張りはプロセス内にしかない。サーバーが落ちると `running` のまま誰も戻さず、その行は**永久に生成中**になる
- **`'idle'` が2つの意味を持つ。** 昇格した直後（`approve.post.ts` が書いてから U13 が `running` に変えるまで）と、steering が終わった後の区別がつかない

走査の有無だけを見れば、どちらの問題も最初から起きない。`.spec-workflow/` が在ることは「本家がプロジェクトルートとして読める中身が出来た」ことそのものであり、完了の定義に一致する。

ユーザーが「完了の判定はラフでよい」と述べているのは、**遅れる方向のラフさ**として受ける。`.spec-workflow/` が出来た瞬間に押せるようになるが、早く出して空を見せる方向には倒さない——出来ていないものを完了として出すことはこの判定では起こらない。

**「作成に失敗」は行として持たない。** 失敗は決着のモーダルで片付き、やり直せば生成中に戻り、破棄すれば行が消える（D2）。したがってこの表に失敗の行は無い。

判定の場所は `buildProjectDirectory` の1箇所とする。`listPromotedProjects`（`control/creating.ts`）は `state.json` から読んだ事実だけを返し、走査と突き合わせない。

### D8. 決着は「知らせる面」と「選ばせるモーダル」の2つに分ける。祝いは `canvas-confetti`

**この2つは別物である。** 1つの器の2画面ではない。

| | 知らせる面 | 選ばせるモーダル |
|---|---|---|
| 役割 | 何が起きたか（成功は祝い、失敗は作りきれなかったこと） | 次に何をするか |
| 大きさ | **画面の半分くらいを埋める**。小さすぎず、全面でもない | 確認を出す寸法 |
| 終わり方 | **フェードアウトで自ら消える** | **選ぶまで閉じない** |

**知らせる面が自ら消えるのは、消えないと操作ができないからである。** 画面の半分を占める面が残り続けると、その間ユーザーは何もできない。祝い（または失敗の告知）を受け取ったら引き、**その後で**選ばせるモーダルが出る。

順序は 知らせる面 → フェードアウト → 選ばせるモーダル。

**器を成功と失敗で同じにする**のは変わらない。違うのは文言と、選ばせる中身だけである。

| | 問い | 選択肢 | 選んだ後 |
|---|---|---|---|
| 成功 | ステアリングの結果をレビューするか | する | `/projects/<projectId>/approvals/<approvalId>` へ |
| | | しない | 一覧へ戻る |
| 失敗 | どうするか | やり直す | 一覧へ戻る（行は生成中に戻る） |
| | | 破棄する | 一覧へ戻る（行が消える） |

**自分から消えない。** 時間で引く形は採らない——決着は「見た」だけでは終わらず、次を選ばせるところまでが1つの出来事だからである。放っておけば消える形にすると、選ばせる面に到達しないまま失敗が無かったことになる。

行に押し込まない・画面遷移しない・画面全体を覆わない、の3つは満たす。

祝いの演出について。

- **@nuxt/ui には相当が無い。** `UToast` は 1行のテキストに限る形で、`notification-toast` の仕様がそれを固定している。行より大きく出す・弾ける、のいずれも満たせない
- **@vueuse/core にも Nuxt 標準にも無い**
- `canvas-confetti` は依存を持たず小さい。ブラウザ専用なので**クライアント側で動的 import** し、SSR に載せない

ユーザーは「クラッカーを鳴らすようなアニメーションのモジュールでいいものがあれば、それを使うのが一番いい」と述べている。自前のパーティクル実装は、保守する対象が増えるだけで、この方針に反する。

知らせる面と選ばせるモーダルはどちらも @nuxt/ui のコンポーネントで組み、confetti は成功の**知らせる面**の上に重ねる。confetti が弾け、面がフェードアウトし、その後にモーダルが出る。

### D9. `replace-polling-with-push` はこの change の後に回し、W3 を口ではなくメッセージ型にする

あちらは失敗の配信のために `/api/strokes/:id/ws/failure` という4本目の口を立てる計画で、`ws/delivery` の「新しい種類の出来事のために配信の口を増やさない」に正面から反する。同じ相手（1つのセッションを見ている画面）へ届く出来事が1つ増えるだけなので、W1 / W2 のいずれかにメッセージ種別を足す形になる。

あちらは 0/30 で未着手なので、書き換えの費用は今なら小さい。

### D10. `notification-feed` の spec は変えない

board WS にメッセージ種別が1つ増えるが、`notification-feed` の7つの要件はいずれも**通知そのもの**（4種に限る・前回値との比較で作る・接続直後は出さない・永続化しない・横断で並べる・行から直行・件数の上限）を規定しており、その WS が他に何を運ぶかには触れていない。生成の配信は通知ではないため、どの要件も破らない。proposal の Impact に「前提が変わる」と書いたのは調べる前の記述で、実際には delta は不要である。

### D11. 削除はメソッドで振り分ける。パスに動詞を置かない

```
DELETE /api/projects/:projectId   ← server/api/projects/[projectId]/index.delete.ts
DELETE /api/sessions/:id          ← server/api/sessions/[id]/index.delete.ts
```

ファイル名は `index.<method>.ts` に揃える。**ディレクトリがパスを表し、ファイル名はメソッドだけを表す。**

**`delete.ts`（メソッドを絞らない形）は採らない。** Nitro の判定は `nitropack/dist/core/index.mjs:853` の

```js
/(\.(?<method>connect|delete|get|head|options|patch|post|put|trace))?(\.(?<env>dev|prod|prerender))?$/
```

で、メソッドとして読まれるのは**ドットで続く接尾辞**だけである。`delete.ts` はパス `/delete` に対する全メソッドの handler になり、**`GET /api/…/delete` でも消える**。プリフェッチや誤クリックで到達しうる形を、最も破壊的な操作に与えることになる。

**パスに動詞（`/delete`）も置かない。** Nitro がメソッドで振り分ける仕組みを持っているのは、パスを名詞に保つためである。

**既存の `POST /api/strokes/:id/delete` も同時に揃える。** capability `api/session/delete` は既に `DELETE /api/sessions/:id` と規定しており、実装がそれに従っていない。プロジェクトの削除を足すこのタイミングで揃える。影響は `docs/specs/api/contract.md`（U11）、`useWaitingRetry.ts`、E2E 4本、`scripts/ws-disconnect-check.ts`。

### D12. 削除の実行だけを切り出す。判定は endpoint の中に置く

| | 置き場所 |
|---|---|
| **phase の判定** | 各 endpoint（`index.delete.ts`）の中 |
| **削除の実行** | `server/handler/**` に1つ |

session と project で**消す動作は同じ**で、違うのは許す phase だけである。

| endpoint | 許す phase |
|---|---|
| `DELETE /api/sessions/:id` | approval **前**（`stroking` / `proposed`） |
| `DELETE /api/projects/:projectId` | approval **以降**（`approved`） |

今は `deleteSessionCore` の中に `phase === 'approved'` を弾く条件が直に書かれており、判定と実行が混ざっている。**実行だけを共通へ出し、判定は呼ぶ側が持つ。** 共通側に「どちらから呼ばれたか」を渡して分岐させると、実行が呼び出し元を知ることになる。

### D13. `projectId` はサーバー側で導出する。画面は id の作り方を知らない

破棄のリクエストは `projectId` で組む（`DELETE /api/projects/:projectId`）。しかし registry に載るのは生きたインスタンスがある間だけで、**steering を書けずに終わったプロジェクトは本家に登録されたことがなく、registry から引けない**。

本家と同じ式で導く。`@pimzino/spec-workflow-mcp` の `dist/core/project-registry.js` をソースで確認した（`node_modules` 実物）。

```js
export function generateProjectId(absolutePath) {
    const hash = createHash('sha1').update(absolutePath).digest('base64url');
    // Take first 16 characters for readability
    return hash.substring(0, 16);
}
```

SHA-1 を **base64url** で書き出し、**先頭16文字**を使う（hex ではない・全長でもない）。導出は `server/utils/upstream/project-id.ts` に置く——**本家に触る知識を接点へ閉じる**ためである（`system-structure.md` の Module Boundaries）。

**渡す値に注意する。本家が渡しているのは `workspacePath` であって `workflowRootPath` ではない。**

```js
// project-registry.js:159 — registerProject の中
const projectId = generateProjectId(workspacePath);
```

本家はこの2つを別の概念として持っている。`workspacePath` は MCP を起こしたときの cwd、`workflowRootPath` は `.spec-workflow/` を置く場所で、`SPEC_WORKFLOW_SHARED_ROOT` を使うと**複数の workspace が1つの `workflowRootPath` を共有する**。

こちらの `ProjectSummary` は `workflowRootPath` という名前のフィールドしか持たず、生成中の行ではそこに `<projectShareRoot>/<name>` が入っている。承認で作ったプロジェクトは cwd がそのまま `<projectShareRoot>/<name>` なので、**この2つはたまたま一致する**——それが導出の成り立つ条件である。共有ルートを使った場合や、外から置かれたプロジェクトでは一致せず、導出値は本家の id と合わない。合わないケースでは registry から引く（そちらは生きている間だけ引ける）。

一致は前提であって保証ではないので、実機で突き合わせる（tasks 6.4）。

導けるのは**自分で作ったもの**だけである。MCP へ渡した cwd がそのまま workspace になり、それは `<projectShareRoot>/<name>` に等しい。外から置かれた一般のプロジェクトは workspace のパスが分からないので導けない——そちらは registry から引ける（生きているときだけ一覧に `projectId` が出る、という今の振る舞いのまま）。

削除の endpoint は逆向きに使う。ハッシュは戻せないので、**保存先の直下を走査して導出値が一致するものを探す**（`index.delete.ts` の `resolveName`）。走査の規模は一覧の組み立てと同じである。

## Risks / Trade-offs

**board WS の意味が広がる** → 今まで `UpstreamMonitor` 由来だけだった口に、自前の出来事が乗る。「本家の中継」という理解でコードを読む人が混乱しうる。→ `board.ts` の冒頭コメントを「上層へのサーバー発イベントの口」に書き換え、`ws/delivery` の spec からその規約を辿れるようにする。

**`GET /api/projects` の仕事が1つ増える** → 走査・registry・承認件数の問い合わせに加えて昇格分の列挙が乗る。列挙は保存先直下の `readdir` と各件の `state.json` 読みで、走査と同じ規模である。→ 走査と並列に走らせる（既に `Promise.all` の形になっている）。

**決着のモーダルを取りこぼす** → WS が切れている間に完了すると、張り直し時の `snapshot` では既に完了済みとして届き、モーダルは出ない。→ 成功についてはこれで**仕様どおりである**（`project/generation` の「決着の瞬間を受け取った画面に出す」）。行は取り直しで通常の行になるので、見えている内容は正しい。

**失敗の決着を取りこぼすと、行が生成中のまま残る** → 失敗したプロジェクトは `.spec-workflow/` を永久に持たないので、判定（D7）は生成中を返し続ける。モーダルを取りこぼした画面では、回り続けるローダーだけが残る。→ この change では**取り直しでも決着しない唯一の穴**として残す。埋めるには「昇格から一定時間 `.spec-workflow/` が出来ていないこと」を失敗と読む必要があり、それは D7 が退けた時間依存の判定に戻ることになる。開き直せば同じ行が生成中として出るだけで、壊れた状態にはならない。破棄したければ削除の口が使える。

**新しい依存が1つ増える** → `canvas-confetti`。→ ライブラリの軸（@nuxt/ui / @vueuse / Nuxt 標準）で賄えないことを D8 に示した。クライアント側の動的 import に限り、サーバのバンドルに載せない。

**束ね方の統合で W1 / W2 を壊す** → 実装の差し替えは振る舞いを変えない前提だが、接続の登録漏れは無言で配信が止まる形で出る。→ `ws-channels` の既存テストを統合後の実装に対して通す。加えて `yarn check:ws-disconnect`（既存スクリプト）を通す。

**`replace-polling-with-push` との衝突** → あちらを先に着手されると、規約に反する4本目の口が生える。→ D9 を proposal と design の両方に書いた。あちらの proposal にも追記する（tasks に入れる）。

## Migration Plan

段階的な移行は不要である。既存のデータ形式も保存先も変わらず、`ProjectSummary` の追加フィールドは既存の行では `'done'` に定まる。ロールバックはコードを戻すだけで、残留物は無い。

## Open Questions

- **決着のモーダルの具体値**（面の寸法、2画面の送り方、confetti の粒の量と弾ける時間）。実物を動かして合わせ、`ui.md` に記録する。仕様が定めているのは満たすべき条件だけで、値が変わっても specs は変わらない
- **「やり直す」の実装。** steering を起こし直す口は U13（AI を起動する唯一の入口）だが、`approved` のプロジェクトに対して起こし直す形をそのまま使えるかは未確認
- **改名失敗の扱い。** 改名に失敗した時点ではプロジェクトが無く phase は `proposed` なので、破棄は `DELETE /api/sessions/:id`、やり直すは再承認になる。同じ面を使うが、選択肢の指す先が違う。名前の衝突は今の訂正の挙動を変えない
- **`prefers-reduced-motion` の下での見せ方。** confetti を止めて面と文言だけ出すのが順当。生成中の行はローダーの回転をどこまで落とすかを実物で決める（明滅は元から持たない）
