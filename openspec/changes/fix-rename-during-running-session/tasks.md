## 1. 着手の記録

- [x] 1.1 ticket `openspec/tickets/fix-rename-during-running-session.md` の `status` を `Doing` に書き換える
- [x] 1.2 同 ticket の `tags` に `pre5/972b5d16-a8c6-4953-9fa9-f1ed4273b60d` を追記する

## 2. 提出の記録を起動単位にする（design Decision 1）

- [x] 2.1 `server/utils/stroke/submission-signal.ts` に、起動 token を単位として**何が提出されたか**（問い／proposal）を持つ記録を足す。既存の steering 用（`hasLaunchSubmission` / `forgetLaunchSubmission`）と同じ寿命・同じ捨て方に揃える
- [x] 2.2 `server/api/strokes/[id]/question.post.ts` が、受理した問いをその起動 token の提出として記録する
- [x] 2.3 `server/api/strokes/[id]/proposal.post.ts` が、受理した proposal をその起動 token の提出として記録する
- [x] 2.4 ストロークの `didWork` を、件数の前後比較（`submittedSince`）から起動 token 単位の記録へ置き換える。`server/utils/stroke/invoke.ts` の `buildRun`（stroke 分岐）が渡す関数を差し替える
- [x] 2.5 `test/server/utils/stroke/submission-signal.test.ts`（無ければ新規）で、起動 token 単位に問い／proposal が記録され、次の起動が前の起動の提出を数えないことを固定する

## 3. 決着の endpoint（design Decision 5）

- [x] 3.1 phase を `proposed` に切り替える endpoint を1本足す。叩くのは invokeAi だけとし、A8・U15 と同じ規律（docblock に明記）
- [x] 3.2 `docs/specs/api/contract.md` の採番規則に沿って新しい endpoint の番号を採り、`server/` の配置は既存の受け口と揃える
- [x] 3.3 その endpoint のテストを書く。存在しない id は受理しない・phase が `proposed` 以外へ動かないことを固定する

## 4. invokeAi の決着（design Decision 1）

- [x] 4.1 `server/utils/stroke/ai.ts` の `runBuiltInvocation` に、`didWork` を確かめた後・`invocation` を `idle` にする前の**決着**の段を足す。steering の `recordCompletion` と同じ位置に置く
- [x] 4.2 `AiRun` に決着の関数（`settle`）を足し、`buildRun` の stroke 分岐がそれを渡す。用途の違いは渡す値の違いだけで表す（`agent/invocation`「起動処理は呼び出し元を区別しない」）
- [x] 4.3 決着の中身: その実行で**問い**が提出されていれば W1 へ配信する。**proposal** が提出されていれば 3.1 の endpoint で phase を `proposed` にし、W2 へ配信する
- [x] 4.4 決着の前に実行が失敗した（タイムアウト・異常終了）ときは決着しない。失敗の扱いは既存の規定のまま（`agent/invocation`「失敗はサーバ側でリトライ」「リトライ上限に達したら error に変える」）
- [x] 4.5 `test/server/utils/stroke/ai.test.ts` に、問いの提出で W1 だけが流れること・proposal の提出で phase が `proposed` になり W2 が流れること・決着が `idle` の**前**に起こること・失敗時は決着しないことを足す

## 5. 提出の endpoint を記録だけに絞る（design Decision 1）

- [x] 5.1 `question.post.ts` から `questionChannel.publish` を外す。記録（`writeState` の今の1問）だけを残す
- [x] 5.2 `proposal.post.ts` から phase `proposed` の書き込みと `proposalChannel.publish` を外す。`docs/proposal.md` を残すことと名前候補の記録だけにする。「残せなければ受理しない」は変えない
- [x] 5.3 既存テスト（`test/server/api/strokes/` の A5・A7 分）を、phase と配信が起こらないことを見る形へ直す
- [x] 5.4 `test/e2e/` のうち A5・A7 の受理で画面が変わることを前提にしているものを、決着で変わる形へ直す

## 6. 409 busy を契約から消す（design Decision 4）

- [x] 6.1 `server/utils/stroke/conflict.ts` の `ConflictReason` から `busy` を消す
- [x] 6.2 `server/utils/stroke/running.ts` の `beginRun` を、実行中なら例外を投げずに「取れなかった」ことを返す形にする。キーの導出（Decision 2）は変えない
- [x] 6.3 `server/api/strokes/[id]/invoke-agent.get.ts` を冪等にする。対象が実行中なら受理して新しい呼び出しを開始しない
- [x] 6.4 `server/api/strokes/[id]/promote.post.ts` から busy の分岐を外す。実行中に届いたら欠陥として失敗を返し、理由を握りつぶさない（ADR 0022）
- [x] 6.5 `server/api/sessions/[id]/index.delete.ts`・`server/api/projects/[projectId]/index.delete.ts` から `isRunning` の busy 分岐を外す。6.4 と同じ扱いにする
- [x] 6.6 `test/server/utils/stroke/running.test.ts`・`promote.post.test.ts`・`invoke-agent.get.test.ts`・`invoke-agent.multiplex.test.ts`・`sessions/index.delete.test.ts`・`projects/index.delete.test.ts` から busy の期待を消し、6.2〜6.5 の振る舞いへ直す

## 7. 画面（design Decision 3・6）

- [x] 7.1 `app/composables/useWaitingRetry.ts` から `pendingRun` と `BUSY_RETRIES` を消す。公開インターフェース（`waiting` / `failed` / `errored` / `startWaiting` / `stopWaiting` / `run`）は変えない
- [x] 7.2 `app/composables/useProposalReview.ts` の `promote()` の失敗を理由ごとに分ける。`name-conflict` は名前の入れ直し、500 は昇格のやり直し／破棄、それ以外はサーバの文言をそのまま失敗に出す（ADR 0022）
- [x] 7.3 `test/app/composables/useWaitingRetry.test.ts` から busy 後の再送の期待を消す
- [x] 7.4 `useProposalReview` のテストに、理由の分からない失敗が汎用の文言に落ちないことを足す

## 8. docs への反映（承認を得てから行う）

- [x] 8.1 design.md「docs・ADR への反映」の表をユーザーへ提示し、**承認を得る**。承認前に `docs/` を書き換えない（`docs/agents/issue-tracker.md`「更新対応」）
- [x] 8.2 `docs/specs/api/contract.md` の A5・A7 を「記録だけ。phase と配信は実行の決着で行われる」へ直す
- [x] 8.3 同 W1・W2 の配信タイミングを「A5／A7 の受理」から「その提出を行った実行の決着」へ直す
- [x] 8.4 同「約束」から `409 busy` の行を消し、U13 が冪等であることを書く
- [x] 8.5 同に 3.1 の決着の endpoint を足す
- [x] 8.6 `docs/specs/api/sessions/invoke-agent.md`・`promote.md`・`delete.md`、`docs/specs/api/projects/delete.md` のエラー表から 409 busy を消す。`promote.md`「実行中は受理しない」の節を「昇格は実行の決着の後にしか要求されない」へ直す
- [x] 8.7 `docs/specs/api/sessions/activate.md` の「busy を見ない」の表現を、busy が無くなった前提へ直す
- [x] 8.8 `docs/specs/architecture/question-flow.md` の図と本文を、phase `proposed` と配信が実行の決着で起こる形へ直す
- [x] 8.9 あわせて `docs/specs/mcp/tools.md` の「busy ガードと前提チェックを通すため」を「多重起動の直列化と前提チェックを通すため」へ直す（busy が契約から消えたことの取りこぼし。作業中に見つけた）

## 9. 検証

- [x] 9.1 `yarn typecheck` が exit 0
- [x] 9.2 `yarn test` が全通過
- [x] 9.3 E2E に「proposal の提出では画面2 が開かない → 実行の決着で開く → 承認 → 改名の時点で対象に実行が無い」を足して通す — `test/e2e/stroke-settlement.spec.ts`。claude の stub（`test/e2e/fixtures/claude-stub.mjs`。台本が無ければ従来の `/bin/true` と同一の no-op）が A7 へ提出したまま止まっている間、U2 は `phase: stroking` / `invocation: running` で画面2 は開かない。解放すると `proposed` / `idle` になり proposal が出る。続く承認が昇格まで通ることが「改名の時点で実行が無い」の証明になる（U14 は枠を取れなければ 500 で落ちるため）
- [x] 9.4 `openspec validate --all` が通る — **本 change は valid。** 全体は 71/80 で、失敗する 9 件（`create-feature`・`create-spec-document`・`fix-agent-question-api-path`・`fix-retry-count-without-launch`・`fix-submit-document-project-name`・`reorganize-server-utils`・`spec-document-management`・`update-changes-operation-flow`・`view-openspec-changes`）はいずれも **specs delta をまだ書いていない別の進行中 change** で、本 change とは無関係の既存の状態である（`proposal.md` か `README.md` だけ、または空）
- [x] 9.5 `yarn check:stroke` を実機で1周通す。承認の手前で実行の終わりを待つ仕掛けが不要になっていることを確かめ、不要なら外す — **通した（EXIT=0・往復1〜2で proposal 到達 → 承認 → 昇格 → steering 文書3本）。** 実体でも `phase: activated` / `invocation: idle` / `.spec-workflow/steering/{product,tech,structure}.md` を確認。`settle()` 一式（本体・4箇所の呼び出し・`beginRoundWait`/`roundStartLogs`・`debugLogDir` 警告の1つ目）を外し、外した状態でもう1周通した
- [x] 9.6 `yarn check:stroke` が起動できない既存の欠陥を直す（9.5 の前提）。`package.json` に `"imports": { "#shared/*": "./shared/*.ts" }` を足す。`#` 始まりは Node の subpath imports として先に解決されるため tsconfig の paths に届かず、tsx が `ERR_PACKAGE_IMPORT_NOT_DEFINED` で落ちていた。`yarn typecheck` exit 0 で影響なし

- [x] 9.7 E2E の全体実行で落ちた2件（`approval-annotation.spec.ts:858` / `document-editing.spec.ts:79`。どちらも `resetBoard` の上流接続待ちで、テストの主題に到達していない）を追う。`server/utils/upstream/socket.ts` の `MAX_BACKOFF_MS` を 30秒 → 5秒にした（backoff を初期値へ戻すのは `open` だけなので、本家が落ちている間は上限に張り付き、その値がそのまま「戻ってきてから繋がるまでの上限」になる）。`test/server/utils/upstream/socket.test.ts` を新規に足し、20回連続で失敗しても待ちが5秒を超えないことを固定した
- [x] 9.8 **9.7 の診断は外れていた（記録）。** 修正前のビルドに印を入れて全体を走らせたところ、77件を通す間に再接続の予約が一度も起きなかった。`resetBoard` が登録簿を空にすると監視対象から外れて socket は `close()` され、書き戻すと `watch()` が**別の socket を作り直す**ので、待ちは毎回初期値から始まる（close → 接続まで毎回 3〜5秒）。**E2E の間欠失敗は backoff の積み上がりが原因ではなく、原因は未特定である。** 9.7 の修正は production 側（本家が登録簿に残ったまま落ちたとき、復帰の上限が30秒だった）では意味があるが、この間欠失敗を直したとは言えない

- [x] 9.9 E2E のポート確保が別 worktree と衝突する欠陥を直す。`playwright.config.ts` の `isFree` は probe を listen して**閉じてから**番号を返すので確保になっておらず（TOCTOU）、同時に始まった実行は揃って 50000 を選んでいた（実測: 旧実装で12本すべてが `STUB=50000 APP=50001`。全体実行が `ECONNREFUSED 127.0.0.1:50000` で39件全滅した事故の原因）。`test/e2e/port-reservation.ts` を切り出し、番号ごとの予約ファイルを排他作成（`open(path, 'wx')`）して確保する形にした。異常終了で残った予約は pid の生死で奪い返す。`test/e2e/port-reservation.test.ts` に11件。**実測: 12本同時で24個の番号がすべて相異なる**
- [x] 9.10 テスト1件の上限を 30秒 → 45秒にした。`approval-annotation.spec.ts` の長い1件が混雑時に 28.8 秒まで伸びて時間切れになる（単独では通る）。上限が実測とほぼ同じで、遅い日にだけ落ちる状態だった。あわせて `playwright.config.ts` の「人が繋ぐ dev サーバー（3399 固定）」という古い記述を、番号の決まり方を指す形へ直した（3399 はどこにも無い。`package.json` の `dev` と `nuxt.config.ts` の `devServer.port` が決める）

- [x] 9.11 E2E が毎回違う1〜2件で落ちる件（`resetBoard` の上流接続待ち）の原因を実測で突き止める — **stroke-board の欠陥ではなかった。** `resetBoard` の周期を229回繰り返して2回再現させ、印を入れて計測した。落ちた回はページの `_nuxt/*.js` が13本まとめて `net::ERR_NETWORK_CHANGED` で捨てられ、Vue app が mount されていない（`__vue_app__` が undefined）。**サーバ側は健全で**、registry を書き戻してから 220ms で本家へ繋ぎ直し `broadcastConnection true` を出していた。`data-connected="false"` は SSR が描いた初期値のままで、待ちを伸ばしても変わらない。引き金はこのマシンの USB Ethernet `enxacde48001122` で、IPv6 link-local アドレスの削除→再付与が75分で39回起きている（`ip monitor` で観測）。Chromium は IP アドレス変更を「ネットワークが変わった」と扱い、宛先が 127.0.0.1 でも飛んでいるリクエストを落とす。**真の治療は機械側**（当該アダプタを down するか抜く）で、権限外のため実行していない。E2E 側は `test/e2e/support.ts` の `test` を拡張し、`ERR_NETWORK_CHANGED` で script が捨てられたら警告を出して読み込み直す手当てを入れた（最大3回・理由で絞る）。spec 17ファイルの import をそこへ切り替えた
- [x] 9.12 9.11 の調査中に見つかった**本物のサーバ欠陥**を直す。`UpstreamSocket` が `close()` の後も `close` / `message` を呼び手へ通していた。見張りは監視を降りるとき socket を閉じて記録を捨てるが、`close` イベントは後から届く（実測2.4秒）。その間に同じプロジェクトが監視対象へ戻ると、張り直した**別の socket の記録**に「切れた」が当たり、実体は開いているのに `open` も `initial` も二度と来ない——接続済みへ戻る道が消える。**production に影響する**（`syncIntervalMs` 既定30秒・`ws` の close handshake timeout も30秒なので、本家が close frame を返さずに落ちて30秒程度で戻ると成立する。起きるとそのプロジェクトの通知が黙って止まり、再起動するまで戻らない）。`test/server/utils/control/monitor.test.ts` に回帰テスト3件（修正前は3件中2件 red）
- [x] 9.13 Playwright の既定 expect timeout（5秒）を15秒にする。`app/layouts/stroke.vue` は teleport される `UModal` なので SSR HTML に出ず、当該判定は必ず hydration を待つ。実測で load average 15 前後のとき p50 3.3秒・最大 4.0秒（n=30）で、既定5秒は余白がほぼ無い。実測表をコメントに残した

## 10. 完了

- [ ] 10.1 実装が specs delta のすべての Requirement を満たすことを確かめ、ユーザーへ完了の承認を求める
- [ ] 10.2 承認を得たら ticket の `status` を `Wait-for-archive` に書き換える
