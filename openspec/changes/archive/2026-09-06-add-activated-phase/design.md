## Context

動機は proposal「Why」。ここは形を決めるのに要る現状だけを書く。

- **phase の書き手は段ごとに1つ。** U14 が `approved` を書き、U10 は書かない（`api/session/promote`）。完成の記録も同じ形で U15 を1本置く（proposal「誰が、いつ、どう書くか」）
- **`invocation` の書き込みは A8 の1本に集まっている。** `writeInvocation`（`session-store.ts`）が唯一の実体で、A8 の endpoint も invokeAi の書き手（`invoke.ts` の `setInvocation`・`ai.ts` の組み立て失敗経路）もここを呼ぶ。上層への合図 `creationOutcomeOf` もここに付いている
- **invokeAi の成功経路は既に「作業が行われたか」（`didWork`）で分岐している**（`ai.ts` の `runBuiltInvocation`、`fix-steering-empty-completion` で steering にも渡った）。判定は呼び出し側（`invoke.ts`）が渡し、`invokeAi` は渡された関数を呼ぶだけ
- **phase の値と読みが散っている。** 値の集合は `shared/stroke.ts` の型と `session-store.ts` の zod に、生読みは `handler/phase.ts`・`session-core.ts`・`creating.ts` の3箇所にある（proposal「phase の値がばら撒かれている現状」）
- **steering 工程には承認依頼を出す手段が無い。** 本家 `request-approval` は allowedTools に載っておらず、`get-steering-guide` も呼ばせない（`adr0016-sub-fix-upstream-mcp-allowance`）。steering の実行が本家に対して行うのは文書の提出（`submit-document`）までである
- **steering の提出は起動単位で記録されている。** `fix-steering-empty-completion` が置いた `submittedByLaunch`（接続 token を単位に、本家が受理した提出だけを数える）。これが「その起動で作業が行われたか」（`didWork`）の実体である
- **本家の REST は起動中しか答えない**（ADR-0005）。`.spec-workflow/` は本家 MCP が接続した瞬間にでき、成果物が無いうちから在る
- **`server/plugins/` には起動時に1回だけ走るプラグインの前例がある**（`01.reap-running.ts`）。参照は U12、書き込みは A8 と、API を通す作りになっている
- **U 系の endpoint は実装では `server/api/strokes/[id]/` に在る**（ticket「見つけた課題」、[[fix-session-api-path]]）。削除の2本だけが `server/api/sessions/[id]/`・`server/api/projects/[projectId]/` に在る
- 制約: ADR-0014（暗黙の状態分岐を持たない。責務の不成立は対象外）・ADR-0005（本家のデータから導出しない）・`portal/batch`（巡回の条件を変えない）
- **`.scratch/stroke-board-frontier/decisions.md` は親にも worktree にも存在しない**（config が指す資料が無い）。本 design は `CONTEXT.md`・`docs/specs/`・`docs/adr/`・`openspec/specs/` だけを根拠にした

## Goals / Non-Goals

**Goals:**

- `approved` と `activated` の2点で生成中の区間を挟み、行（一覧）も配信（決着）も phase だけを見る
- 成功の決着の出どころを A8（`writeInvocation`）から U15 へ移す
- phase の値の集合を1箇所に置き、`activated` を落とす分岐（proposal の Impact・ticket「落ちる分岐」）を全部通す
- 生読みの `readPhase` を減らす。`handler/phase.ts` を没にする
- 既存の `approved` な `state.json` を起動時に書き上げる

**Non-Goals:**

- U 系 endpoint の path を `/api/sessions/` へ揃えること（[[fix-session-api-path]]）。U15 だけは docs の定義に従い `server/api/sessions/[id]/` に置く
- `didWork` の判定そのものを変えること（`fix-steering-empty-completion`）
- 画面の変更。知らせる面・モーダル・やり直す・破棄する・入場のガードは既にあり、`creation` / `connection` の値の集合も変えない
- 本家との接続（アクティブ判定）の仕組みを変えること。生成中の行をその判定から外すだけ

## Decisions

### D1. phase の値は `shared/stroke.ts` の定数1つから導く

`PHASES = ['stroking', 'proposed', 'approved', 'activated'] as const` を置き、`Phase` はそこから導く。`session-store.ts` の zod も、`session-core.ts` の一覧用の読みも、この定数を見る。**イコール比較の連鎖をどこにも書かない。**

「昇格済みか」（`approved | activated`）は各所で要る。`isPromotedPhase(phase)` を `shared/stroke.ts` に1つ置く。`handler/phase.ts` の `isAfterApproval` と違い、**読みを含まない純関数**で、endpoint の外に「どの局面を許すか」の判断を置くものではない（各 endpoint は自分の受理範囲を自分の literal で書く。D5）。

代替: 各所に `=== 'approved' || === 'activated'` を足す。値が5つ目に増えたとき同じ事故が起きるので採らない。

### D2. `state.json` の昇格後の形は `approved` と `activated` で同じ

`SessionState` の昇格後の分岐を `PromotedState`（`phase: 'approved' | 'activated'`、`projectName`・`invocation`・`retries`・`runId`）として1つにまとめ、zod は同じフィールド定義を2つの literal 分岐で共有する（`z.discriminatedUnion` は分岐ごとに literal が要る）。

`activated` への書き込みは `writeState(name, { ...state, phase: 'activated' })` の1行で、他のフィールドを触らない。`runId` を保つのは、完成後の steering の起こし直しが会話の続きから始まるためである（`agent/invocation`「完成した対象も記録を持つ」）。

### D3. U15 は判定を持たない。phase だけを見て、`invocation` に触れず、busy を見ない

`server/api/sessions/[id]/activate.post.ts`。判定の順序と応答:

| 順 | 判定 | 通らないとき |
| --- | --- | --- |
| 1 | 対象が在る（`requireSessionId`） | 404 |
| 2 | `readState` が読める | 409 `phase`「state.json を読めない」（壊れたものを書き換えない） |
| 3 | phase が `approved` | `stroking` / `proposed` → 409 `phase`「まだ昇格していない」、`activated` → 409 `phase`「既に完成している」 |
| 4 | `writeState` で `activated` を書く | 500 |
| 5 | `broadcastProjectCreation(name, 'done')` | 配信の失敗は応答に関わらない（U14 と同じ） |

**完成したかを、ここは決めない**（ADR-0014）。決めるのは呼び手である——invokeAi はその起動で steering 文書の提出が本家に受理されたか（`didWork`）を見て（D4）、起動時の書き上げは一覧が持つ実行の記録（`invocation: 'idle'`）で対象を選ぶ（D9）。この endpoint がするのは `approved` → `activated` の一方向の遷移を記録することだけである。**ファイルシステム（`.spec-workflow/` 配下）も本家 REST も一切読まない。** 残る判定は「受け取った id に対してこの責務が成立するか」だけで、これは ADR-0014 が対象外とする「責務の不成立」の分岐にあたる（proposal「U15 と ADR-0014 の関係」）。

> **承認依頼を根拠にする案は 2026-09-04 に退けた。** 当初は「`.spec-workflow/approvals/<category>/*.json` が1件以上在ること」を完成の唯一の根拠にしていた（実装・実機確認 2026-09-02）。理由は2つ。**(1) API が状態を判定していた**——呼び出し側が渡していないファイルシステムの状態を読んで受理の可否を変えており、ADR-0014 に反する。**(2) steering 工程には承認依頼を出す手段が無い**——本家 `request-approval` は allowedTools に載っておらず、`get-steering-guide` も呼ばせない。実運用の steering は文書を提出しても U15 に 409 で断られ、`failed` → 巡回 → `error` に倒れた（2026-09-04 実機確認）。判定は呼び手（invokeAi の `didWork`）へ移した。

**busy ガードを持たない。** U15 は invokeAi が `invocation` を `idle` に変える**前**に叩く（D4）。その時点で対象の実行はまだ占有中なので、busy を見ると自分の実行に弾かれる。`invocation` を書かないのは spec の規定で、書く理由も無い——実行の記録は invokeAi が U15 の応答を見てから書く。

**409 はすべて `phase` の kind で返す。** 画面は 409 を「待てば通る」と読む（`utils/conflict`）。U15 を叩くのは invokeAi と起動時の書き上げだけで、どちらも 409 を「この対象は今この責務を成立させない」と読んで `failed` にする／飛ばす。

代替: U14（昇格）に `{ phase }` を足す。U14 は本文を取らない契約で、名前を引数で受ける余地を開くので採らない。A8 に `activated` を書かせる。A8 は `invocation` の口で、phase を書き始めると「値をそのまま書くだけ」の契約が崩れるので採らない。

### D4. invokeAi は「完成の記録」を `didWork` と同じ形で呼び出し側から受け取る

`AiRun` に `recordCompletion?: () => Promise<boolean>` を足す。`runBuiltInvocation` の成功経路:

```
result.ok
  └ didWork が false                         → failed（recordCompletion は呼ばない）
  └ didWork が true
       └ recordCompletion が無い（ストローク・完成済みの steering）  → idle
       └ recordCompletion が在る（生成中の steering）
            └ 呼ぶ。true → idle / false（409・404・不達）→ failed
                 ※ 断られても、読み直して既に activated なら true（下の例外）
```

**`didWork` を先に見る。完成の判定はこれである。** 記録先の U15 は判定を持たない（D3）ので、判定はここにしか無い。`didWork` は `fix-steering-empty-completion` が置いた「その起動で steering 文書の提出が本家に受理されたか」（`submittedByLaunch`）で、生成が終わったかの問いにそのまま答える。作業をしていない実行が完成の記録に進むと、何も出していない対象が完成として畳まれる。

> **順序は 2026-09-04 に逆にした。** 当初は「完成の記録の受理が作業の判定に代わる（`didWork` を先に見ない）」としていた（2026-09-02）。これは U15 が承認依頼を根拠にしていた時の理屈で、「承認依頼が在れば作業は済んでいる」という前提に立っていた。U15 から判定を外した以上、受理は何も保証しない（D3 の引用）。

`invokeAi` に新しい判定を作らない。「いつ叩くか」は関数が渡されているかどうかで決まり、それを決めるのは呼び出し側（`invoke.ts`）である——`didWork` と同じ置き方で、`agent/invocation`「起動処理は何の作業かを判定してはならない」を守る。

`recordCompletion` の実体は `invoke.ts` の steering 分岐に置き、`phase === 'approved'` のときだけ渡す（導出は変えない）。`$fetch(activatePath(id), { method: 'POST' })` が 2xx なら true、それ以外（409・404・不達）は false。**不達も false にする**のは、記録できていないものを完成と扱わないためで、`failed` に倒れれば巡回が起こし直し、次の実行の完了時にもう一度記録を試みる。例外は1つで、断られた時点で phase を読み直し **既に `activated` なら true** とする——起動時は巡回の初回と書き上げが同時に走るので、`approved` として起こした実行の完了時に U15 が「既に完成している」で断ることがある。目的は果たされているので `failed` に倒さない（レビュー指摘 2026-09-02）。判定は U15 の応答の文言ではなく phase の読み直しで行う。

そのために `kick` は `kind` の代わりに **phase を受け取る**。`kind`（`stroke` / `steering`）・`runId`・`recordCompletion` の3つはいずれも phase から導くので、導出を `invoke.ts` の1箇所に集める。U13 は `state.phase` を渡すだけになり、`invoke-agent.get.ts:61` と `:72` の `=== 'approved'` は消える。

`activatePath(id)` は `submission-path.ts` に並べる（`invoke.ts` と `server/plugins/` の両方から読む。循環 import を避ける置き場は A8 の path と同じ理由）。

代替: `runBuiltInvocation` が cwd の phase を自分で読んで U15 を叩く。起動処理が用途を判定することになり、spec に反するので採らない。

### D5. 削除の2本は `readState` で読み、受理範囲を自分の literal で持つ

`handler/phase.ts` を消す。

| endpoint | 受理する phase | 断る理由 |
| --- | --- | --- |
| U11 `DELETE /api/sessions/:id` | `stroking` / `proposed` | それ以外 → 409 `phase`「承認済みのものはここでは消せない」 |
| P1 `DELETE /api/projects/:projectId` | `approved` | `stroking` / `proposed` → 409「まだプロジェクトになっていない」、`activated` → 409「中身のあるプロジェクトはここでは消せない」 |

P1 の「本物は消さない」の根拠を `.spec-workflow/` の有無から `activated` へ移す（`api/project/delete` delta）。`hasSpecWorkflow` は消す。

**壊れた `state.json` は消さない。** 対象のディレクトリは在るが `readState` が失敗するとき、409 `phase`「state.json を読めない」で断る。`handler/phase.ts` の「分からないものを通さない」を引き継ぐ。存在の確認（404）は `readState` の前に置く（`sessionExists`）——無いものに「読めない」と言わない。

P1 は `projectId` から名前を引くのに保存先を走査する。走査はそのまま（`resolveName`）。

### D6. 生読みは `session-core.ts` の一覧用の1本だけ残し、値の集合は D1 から引く

| 場所 | いま | 後 |
| --- | --- | --- |
| `handler/phase.ts` `readPhase` | 生読み・literal 連鎖 | **没** |
| `creating.ts` `isApproved` | 生読み・`=== 'approved'` | `readState` を使い、`isPromotedPhase` で拾う。読めないものは飛ばす（今と同じ） |
| `session-core.ts` `readPhase` | 生読み・literal 連鎖・外れた値は `unknown` | 生読みは残す。値の判定を `PHASES` に含まれるかに変える。外れた値・読めないものは `unknown` のまま |

`session-core.ts` に `readState` を持ち込まないのは、core が Nitro 無しの経路（script）から読まれる層で、`session-store.ts` は配信（`control/board`）を import しているためである。一覧は壊れた1件で全体を落とせず、`unknown` に倒す挙動も残す（`api/session/list`）。proposal の「読みは `readState` に1本化」は**サーバ層について**成り立ち、core 層に軽い読みが1本残る。

### D7. `creationOutcomeOf` は失敗だけを流し、成功は U15 が流す

```
creationOutcomeOf(phase, invocation)
  phase が approved でない → null
  invocation === 'error'  → 'failed'
  それ以外                → null       （idle → 'done' を消す）
```

`activated` の対象で `error` に達しても流さない。失敗のモーダルは「やり直す／破棄する」を出し、破棄は P1 を叩く。完成済みのプロジェクトは P1 が断る（D5）ので、モーダルを出しても選べない選択肢が並ぶ。完成済みの steering の起こし直しが `error` に達したときの知らせ方は、この change の外（`stroke/frontier`「実行が error に達したら画面が示し」の対象でもない）。

`writeInvocation` のコメント（「行の判定は `.spec-workflow/` の有無から導く」「`invocation` を合図の材料に使っても…」）は書き直す。proposal「Why」が指摘した半端な状態の追認を残さない。

### D8. 行の `creation` は phase から引き、生成中の行を接続の判定に掛けない

`listPromotedProjects` は `{ name, path, phase }` を返す（phase は `approved | activated`）。`directory.ts` の組み立て:

| 走査（`.spec-workflow` 有り） | 昇格の記録 | 行 |
| --- | --- | --- |
| 有 | 無（外から置かれた） | `creation: 'done'`、接続の判定に掛ける |
| 有 | `activated` | `creation: 'done'`、接続の判定に掛ける |
| 有 | `approved` | `creation: 'in-progress'`、`connection: 'disconnected'` 固定。**registry に載っていても `active` にしない** |
| 無 | `approved` | `creation: 'in-progress'`、`connection: 'disconnected'`（今と同じ） |
| 無 | `activated` | **起動時の書き上げが畳んだ legacy で起こりうる**（D9・Risks「成果物ゼロの legacy を畳む」）。`done`・`disconnected` |

行の型（`ProjectSummary`）は変えない。`creation` と `connection` の値の集合は今のままで、画面の入場ガード（`connection !== 'active'` で弾く）はそのまま効く。生成中の行の `projectId` は今と同じく導出で埋める（決着の直後に承認画面を開くため）。`pendingApprovals` と `lastModified` は生成中の行では `null` のまま（今と同じ。走査で拾えても埋めない——生成中に本家の値を見せない）。

### D9. 起動時の書き上げは専用プラグインが U12 → U15 で行う

`server/plugins/01.activate-approved.ts`。起動のたびに1回:

1. U12（`/api/strokes`）を取る。取れなければ警告して何もしない
2. **`phase === 'approved'` かつ `invocation === 'idle'`** の各件に U15 を POST する
3. 2xx を「書き上げた」、409 を「生成中のまま残す」として数え、件数を1行でログに出す。その他の失敗も件数だけ出して続ける

参照は API、書き込みも API（`01.reap-running.ts` と同じ作り）。

**対象は一覧が持つ state だけで選ぶ。** 完成の記録の導入前に生成を終えていたものは、最後の実行が正常終了して `invocation` が `idle` のまま残っている。`failed` / `error` は生成が終わっていないもの（巡回とユーザーの再実行が拾う）、`running` は起動時の後始末（`01.reap-running.ts`）が `failed` へ倒す途中なので、どれも生成中のまま残す。**ファイルシステムを見て成果物を数える判定は置かない**——U15 も判定を持たない（D3）ので、ここが完成の判定の在り処である。`.spec-workflow/` は本家 MCP が接続した瞬間にでき、成果物が無いうちから在るため、数えても答えにならない。

`01.reap-running.ts`・`01.retry-failed.ts` との順序の取り決めは持たない。U15 は `invocation` に触れず busy も見ないが、**`state.json` は1ファイルで書き込みは丸ごと**なので、「読んで書く」の2手が後始末（A8）と重なると古い写しで互いを上書きしうる（レビュー指摘 2026-09-02）。そのため `session-store.ts` に `withStateLock(sessionId, run)` を置き、read-modify-write をセッション単位で直列化する。通すのは A8（`writeInvocation`）・U15・会話 id の記録（`invoke.ts` の `conversationWriter`）の3つで、書き手はすべて同一プロセスなのでプロセス内の待ち行列で足りる。

起動のたびに走らせても、`activated` になった対象は U12 で `approved` として出てこないので、2回目以降は何もしない。

### D10. U7（回答）は承認以降を1つの門で断る

`answer.post.ts:29` の `=== 'approved'` を `isPromotedPhase(state.phase)` に変え、メッセージは「承認済みのセッションには回答できない」のまま。`activated` が「答えるべき問いが無い」に落ちる経路を閉じる。

## Risks / Trade-offs

- **[archive の順序] `fix-steering-empty-completion` と同じ Requirement を MODIFIED している** → あちらを先に archive する（proposal「対象外」）。あちらの文はこの change の delta に含めてあるので、順序を守れば main は欠けない。**2026-09-04 に解消**——あちらは archive 済み（`changes/archive/2026-09-04-fix-steering-empty-completion`）で、この change の delta はその後の main を写している
- **[巻き戻し] `activated` を書いた `state.json` が残ったまま `Phase` から `activated` を外すと、`readState` が失敗して削除の2本がどちらも受理しなくなる** → 巻き戻すときは、`state.json` の `activated` を `approved` へ戻す一度きりの手順を先に踏む（D9 の逆）。この手順は docs の Migration に書く
- **[起こし直しが空振りすると倒れる] 前の起動で文書を出し終えた後にプロセスが落ち、起こし直しがこの起動では何も提出せずに終えると、`didWork` が false になって `failed` に倒れる。それを繰り返すと上限に達して `error` になり、文書が在るのに完成として畳まれない** → 完成の判定を `didWork` に置いた以上、この経路は残る。決着として「失敗」がユーザーに届き、「やり直す」で再実行できるので、行き止まりにはならない。U15 の受理を判定に代える形（旧 D4）はこれを避けられたが、U15 に判定を持たせることが前提だった（D3 の引用）ので採らない。起こし直しの定型は「続きを促す1本」で、文書の出し直しか追記を促すため、実際には提出が起きることが多い
- **[U15 の不達] invokeAi から U15 に届かないと `failed` に倒れ、巡回が steering を起こし直す。起こし直しは会話の続きなので、その実行で提出があれば次の完了時に U15 が受理する** → 余分な実行が1回走るが、成果物は壊れない。不達を `idle` に倒す方が「完成の記録が無いのに完了」を作るので採らない
- **[起動時の書き上げの取りこぼし（実行の記録）] 導入前に生成を終えたが、最後の実行が `failed` / `error` で終わっていたものは書き上がらない** → 生成が終わっていないものと区別できない。巡回とユーザーの再実行が拾い、次の完了で U15 が受理する
- **[起動時の書き上げが決着を流す] 書き上げは畳んだ件ごとに U15 を通るので、`broadcastProjectCreation(name, 'done')` が件数ぶん流れる**（U15 は呼び手を区別しない。D3） → cold start では接続中の画面が無いので誰にも届かない。**`yarn dev` の再起動を一覧を開いたまま行うと、ユーザーが生成を見ていない legacy について祝いの面と決着のモーダルが出うる。** `project/generation`「決着を知らせるのは、その瞬間を受け取った画面に対してだけ」の趣旨とは擦れるが、書き上げは導入をまたぐ一度きりで、2回目の起動からは対象が居ない（D9）。U15 に呼び手を見分けさせると「判定を持たない」が崩れるので、そちらは採らない
- **[起動時の書き上げの取りこぼし] U12 に載らないもの（openspec ルートや `config.yaml` が壊れた昇格済みプロジェクト）は書き上がらず、生成中のまま並ぶ** → 一覧に載らないものは巡回の対象でもなく、今も扱いが定まっていない。この change では拾わない。件数をログに出すので気づける
- **[行の見え方] 既に `.spec-workflow` を持つ `approved` のプロジェクトのうち、`invocation` が `failed` / `error` で残っているものは、導入後「アクティブ」から「生成中」に変わる** → 成果物を持たないものについては正しい表示である。中身が無いので入場しても 404 になっていた（ticket「追加の観測」）。`idle` のものは起動時の書き上げが `activated` に畳むので、行は「アクティブ」のまま変わらない（次項）。**ただし成果物を持つものは次項のとおり危険である**
- **[中身のある legacy が破棄で消えうる] 導入前に steering 文書を書き終えたが、その後の起こし直しが空振りして `invocation` が `failed` / `error` のまま止まっている legacy は、次の連鎖で成果物ごと消えうる**（santa-method レビュー指摘 2026-09-04・4周目）:

  ```
  approved + failed/error（文書は在る）
    → 起動時の書き上げは idle だけを見るので畳まない（D9）
    → 行は「生成中」
    → 巡回が steering を起こす → 文書は既に在るので提出が起きない
    → didWork false → failed → 上限で error（D4）
    → creationOutcomeOf(approved, error) が失敗の決着を配信
    → 失敗のモーダルの「破棄する」→ P1 は approved を受理（D5）
    → .spec-workflow/steering/ の成果物ごと消える
  ```

  旧 P1（`.spec-workflow/` の有無で断る）と旧 U15（承認依頼を数え、`invocation` を問わず `approved` を畳む）では、この型は両側から守られていた。**D9 を `idle` 限定にしたこと（判定の材料をファイルシステムから state へ移した結果）と、D5 が `.spec-workflow/` のガードを外したことの組み合わせで生じた新しい経路である。**

  → **導入前に一度だけ手当てする。** `projectShareRoot` の `approved` かつ `invocation` が `idle` でないものを列挙し、`.spec-workflow/steering/` が空でないものを手で `activated` に直す（書き上げの逆ではなく、書き上げの補い）。これは Migration Plan の 6 に含める。**自動で拾わない**——拾うにはファイルシステムを数えることになり、U15 から追い出した判定が起動時の書き上げに生えるためである（D9）。件数は少なく、一度きりで済む
- **[起動時の書き上げが成果物ゼロの legacy を畳む] `didWork` の導入（`fix-steering-empty-completion`）より前は、成果物を1つも作らずに正常終了した実行も `idle` を書いていた。D9 はその `approved` + `idle` を成果物を見ずに `activated` へ書き上げるので、中身の無いプロジェクトが完了として並ぶ**（ticket「事実」の `setai-2`: `phase: approved` / `invocation: idle` / `.spec-workflow/steering` 0件。ticket「調べた事実」の表が `invocation === 'idle'` を「不可——何も作らずに正常終了しうる」としていたのはこの型のことである） → **承知のうえで許容する。** 理由は3つ。(1) 成果物を数えないことがこの change の要点で、ここだけファイルシステムを見ると U15 から追い出した判定が別の場所に生えるだけである。(2) 起動時の書き上げは**導入をまたぐ一度きりの移行**で、`didWork` が入った後の実行は成果物ゼロなら `idle` を書かないので、この型はほぼ増えない（厳密には、昇格の最後に A8 へ `failed` を引き渡す `promote.post.ts` がその引き渡しに失敗すると `approved` + `idle` が新たに残りうる。稀でエラーログも出るが、「絶対に増えない」ではない）。(3) 畳まれても回復できる——完成済みのプロジェクトは入場でき、空なら P1 の「破棄する」では消せないが、実体を手で消せばよい。件数はログに出る。**旧 U15（承認依頼を数える形）ならこの型は 409 で生成中に残っていた**ので、これは判定を外したことによる意図的な振る舞いの変化である
- **[残る症状] ticket の症状5「「レビューする」を押しても承認依頼が何も出ていない」は、この change では閉じない** → 完成の定義が「steering 文書を出し終えた」であって「承認依頼が在る」ではなくなったので、承認依頼ゼロのまま完成になり、「する」が空の承認一覧へ着地しうる。**そもそも steering 工程は承認依頼を出せない**（Context）ので、この change の範囲では閉じようがない。閉じるなら承認依頼を出す工程を別に置く話になり、別の change である。**行き止まりにはならない**——`projects/index.vue` の `review()` は `approvalId` が引けなければ承認の一覧へ落とす（実装済み）。この経路が例外ではなく通常であることを `project/generation`「決着したら、知らせてから次を選ばせる」の delta に書き足し、main specs に満たせない SHALL を残さないようにした（santa-method レビュー指摘 2026-09-04・4周目）
- **[生読みが1本残る] `session-core.ts` の `readPhase`** → 値の集合は D1 から引くので、値が増えても直す場所は `shared/stroke.ts` だけである

## Migration Plan

1. `shared/stroke.ts`（D1）→ `session-store.ts`（D2・D7）→ `session-core.ts`・`creating.ts`（D6）の順に、`activated` を読める状態を先に作る
2. U15 を置く（D3）。`activatePath` を `submission-path.ts` に足す
3. `invoke.ts`・`ai.ts`・`invoke-agent.get.ts`（D4）
4. 削除の2本と `handler/phase.ts` の削除（D5）、`answer.post.ts`（D10）
5. `directory.ts`（D8）
6. 起動時の書き上げ（D9）。**起動して一度走らせ、実物の `/opt/projects` の `approved` かつ `invocation: 'idle'` が書き上がり、`failed` / `error` / `running` が残ることを確かめる**

   **その前に一度だけ手当てする**（Risks「中身のある legacy が破棄で消えうる」）。`approved` かつ `invocation` が `idle` でないものを列挙し、`.spec-workflow/steering/` が空でないものを手で `activated` に直す。放置すると、巡回 → `error` → 失敗のモーダルの「破棄する」で成果物ごと消える経路が開く。**この手当ては一度きりで、コードには入れない**
7. docs の整合反映（proposal「上位資料への整合反映」の表）。`CONTEXT.md`「生成中」の一文、`docs/specs/api/` の目録・契約・`ws/delivery.md`・`projects/delete.md`、`docs/specs/plan/portal-stroke-exit.md` の図

巻き戻し: 上の Risks のとおり、`state.json` の `activated` を `approved` へ戻してからコードを戻す。

## Open Questions

- ~~U15 が `.spec-workflow/approvals/` を読むとき、本家の `approvals/` 配下に category 以外のファイルが在るか~~ → 実装時に確認（2026-09-02）。category の直下に `approval_<ts>_<id>.json` が並び、隣に `.snapshots/` ディレクトリが在る。**この問い自体が失効した**（2026-09-04）——U15 は判定を持たず、ファイルシステムを読まない（D3）
- ~~完成の判定を U15 に置くか、呼び手に置くか~~ → 呼び手に置く（2026-09-04・D3・D4）。U15 に置くと ADR-0014 に反し、かつ steering 工程が持てない材料（承認依頼）に依存していた
- **未決: P1 が `.spec-workflow/` ごと消すことと、`upstream-connection`「本家に書き込まない」の関係**（santa-method レビュー指摘 2026-09-04・4周目）。生きた `openspec/specs/upstream-connection` は「各プロジェクトの `.spec-workflow/` に対して、直接の書き込み・更新・**削除**を行ってはならない（MUST NOT）」と定めている。一方 D5 でこの change は P1 の断り方を `.spec-workflow/` の有無から phase へ移したので、`api/project/delete` の delta は「`.spec-workflow/` はできているプロジェクトに削除が要求される → 受理し、`.spec-workflow/` ごと残らず消える」を SHALL として要求する（`removeTarget` が実際に消す）。**変更前は P1 が `.spec-workflow/` を持つものを断っていたので矛盾は無かった。この change が新たに作った矛盾である。**

  これは D5（この change の元からの範囲）に属し、**2026-09-04 の3点の見直しとは別の論点**なので、ここでは決めずに残した。取りうる形は2つ——(a) `upstream-connection` に「stroke-board 自身が作って作りきれなかったプロジェクトの破棄は例外とする」旨の MODIFIED delta を足す、(b) P1 が `.spec-workflow/` を残して消す。**(a) は MUST NOT に例外を開けるので、ADR-0014 の但し書き（例外はユーザーの指示か事前の承認が要る）と同じ扱いでユーザーの判断を要する。**

  → **決着（ユーザー判断 2026-09-06）: Requirement「本家に書き込まない」をこの change で撤廃する（REMOVED）。** 例外を開ける (a) でも P1 を変える (b) でもなく、規定そのものを外す。(b) は `.spec-workflow/` だけの孤児ディレクトリを残し、走査でそれが完了したプロジェクトとして並ぶので、この change が潰した症状を別の形で戻す。delta は `specs/upstream-connection/spec.md`。同じ spec の「パスから本家の projectId を引き当てる」が「上の『本家に書き込まない』は…」と参照しているので、その一文を外す MODIFIED も同じ delta に置く。本家の状態を変える操作を本家の API 経由で行う実装（承認・却下、文書の保存）はそのまま残るが、規定としては持たない
