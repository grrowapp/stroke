## Why

**症状**: 承認を押した時点で flontier の claude がまだ走っていると、改名がその claude を置き去りにする。`rename(2)` は inode を保つので claude の cwd は改名先へ追随して生き続けるが、自分を名乗る id は改名前の uuid のままなので、以後のツール呼び出しが全部 `session_not_found` になり、`invocation` はどこにも残らない。

改名を行う endpoint は U14（`POST /api/sessions/:id/promote`）である。起票した 2026-08-31 の時点では承認（U10）が判断の記録から改名・起動までを一度に行っていたが、その後 develop で承認が3段（U10 判断の記録 / U14 昇格 / U13 起動）に分割され、改名は U14 へ移った。

### 根本原因: 責務境界（2026-09-09 ユーザー指摘）

**proposal を提出する endpoint（A7）が、提出の記録だけでなく phase の切り替え（`stroking` → `proposed`）と画面への配信（W2）まで持っている。** 問いを提出する endpoint（A5）も同じく、記録と同時に W1 へ配信する。

phase `proposed` は「proposal が承認を待っている」局面であり、画面2 はこの phase で承認の操作を出す。ところが A7 は claude のプロセスがまだ走っている最中に呼ばれる——claude は提出の後も終了処理（残りの出力・実行の記録）を続ける。**endpoint が phase を切り替えるため、実行が終わる前に承認できる局面が立つ。** 承認 → 昇格 → 改名が走っている claude の下で起こるのはこのためである。

claude のプロセスを制御しているのは invokeAi である。実行がいつ終わったかを知るのは invokeAi だけであり（`agent/invocation`「完了は output stream で検知して idle に変える」）、steering の完成の記録（U15）は既に invokeAi が実行の完了時に行っている。**実行の決着——その実行で何が提出されたかに応じて phase を切り替え、画面へ配信すること——は invokeAi の責務であって、提出を受ける endpoint の責務ではない。** endpoint の責務は提出を記録することだけである。

### これまでの対処が入口を塞げなかった理由

サーバ側の busy ガード（`c086907e`、2026-09-01。キーは作業場所の実体 `dev`/`ino`、U14 が `beginRun` で lock を取り、実行中なら 409 busy）は、承認できる局面が実行中に立つことを前提にしたまま、後ろで受け止めているだけである。画面は busy を汎用の失敗に落としており（ADR 0022「応答の握りつぶしは、いかなる者にも許されない」に当たる）、「待って出し直す」責務が呼び手に散って `useWaitingRetry` の `pendingRun`・巡回と画面の二重キックのような取りこぼしを繰り返してきた。

決着が invokeAi に移れば、phase `proposed` は実行が終わった後にしか立たず、承認できる局面と実行中は同時に存在しない。**409 busy は到達不能になるので、契約から消す**（ユーザー指示 2026-09-09）。リロード・複数タブ・サーバの再起動は後始末の問題であり、本 change では扱わない。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、範囲外の扱いは不正だった（ユーザー指摘 2026-09-01）ので change を立てた。2026-09-09 に「409 で逃げず、発生し得ない設計にする」「409 busy を無くす」「根本原因は責務境界」（ユーザー指示・指摘）へ方向を改めた。

## What Changes

- **変更（根本）: 提出の endpoint（A5 問い・A7 proposal）は記録だけを行う。** phase を切り替えず、画面へ配信しない
- **変更（根本）: 実行の決着は invokeAi が実行の完了時に行う。** その実行で提出されたもの——問いなら W1 へ配信、proposal なら phase を `proposed` に切り替えて W2 へ配信——を、`invocation` を `idle` にする前に行う。steering の完成の記録（U15）と同型
- 変更: 画面2 の承認の操作は phase `proposed` で出す（現状どおり）。phase `proposed` は決着でしか立たないので、実行中に承認の操作は存在しない
- **変更: 「実行中だから受理しない」（409 busy）を契約から無くす。** 起動（U13）は冪等——対象が既に走っていれば要求は満たされており、受理して何もしない。昇格（U14）・セッション削除（U11）・プロジェクト削除（P1）に実行中の要求が届く経路は無く、届いたら欠陥として失敗を返す（握りつぶさない）
- 変更: `useWaitingRetry` の busy 後の再送（`pendingRun`・`BUSY_RETRIES`）を消す。到達しない
- 変更: 承認画面が昇格の失敗理由を握りつぶさない（ADR 0022）
- 作り直し: design.md（`running.test.ts` が「D2」として参照する Decision 2 の宛先）と tasks.md

### 他の change との関係

- `replace-polling-with-push`（`useWaitingRetry` のポーリングを push へ）: 本 change は `useWaitingRetry` から busy 後の再送を消す。あちらはポーリングの撤去。同じファイルに触るので順序を決める必要がある（ユーザー判断）
- `api/stroke/proposal`・`api/stroke/submission` の spec は「正として扱わない」と注記されている（ADR 0019。ユーザーが承認したのは「提出は `submission` へ寄せ、A7 は無くなる」形）。本 change の規定は「提出を受ける endpoint は記録だけ」であり、endpoint の path が A7 でも `submission` でも同じに当てはまる

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: 実行の決着（提出されたものに応じた phase の切り替えと配信）は invokeAi が完了時に行う
- `api/stroke/question`: A5 は問いを記録するだけ。配信しない
- `api/stroke/proposal`: A7 は proposal を記録するだけ。phase を切り替えず、配信しない
- `api/session/ws`: W1・W2 の配信の時点を「提出の受理」から「その提出を行った実行の決着」へ
- `stroke/frontier`: 承認の操作は実行の決着の後にしか存在しない。失敗理由を握りつぶさない
- `api/session/invoke-agent`: 起動は冪等。busy を持たない
- `api/session/promote`: 昇格は実行の決着の後にしか要求されない。busy を持たない
- `api/session/delete`・`api/project/delete`: busy の Requirement を REMOVED。削除は実行の決着の後にしか要求されない

## Impact

- `server/utils/stroke/ai.ts`（`invokeAi`）— 完了時の決着。提出されたものを起動 token 単位で読み、phase の切り替えと W1/W2 の配信を `idle` の前に行う
- `server/api/strokes/[id]/question.post.ts`・`proposal.post.ts` — 記録だけに絞る。phase の書き込みと `publish` を外す
- `server/utils/stroke/submission-signal.ts` — 提出の内容（問い／proposal）を起動 token 単位で持つ
- `server/routes/api/strokes/[id]/ws/{question,proposal}.ts` — 接続時配信は現状どおり（記録を読む）
- `server/utils/stroke/running.ts`・`conflict.ts` — `busy` を消す。U13 は実行中なら受理して何もしない。直列化のキー（Decision 2）は残す
- `server/api/strokes/[id]/invoke-agent.get.ts`・`promote.post.ts`・`server/api/sessions/[id]/index.delete.ts`・`server/api/projects/[projectId]/index.delete.ts` — 409 busy を外す
- `app/composables/useProposalReview.ts` — `promote()` の失敗理由を握りつぶさない
- `app/composables/useWaitingRetry.ts` — `pendingRun`・`BUSY_RETRIES` を消す
- docs（design で提案し、承認後に直す）: `docs/specs/api/contract.md`（A5/A7 の順序「残す → phase → W2」→「残すだけ」、W1/W2 の配信の時点、「約束」の 409 busy 行）、`docs/specs/api/sessions/{invoke-agent,promote,delete}.md`・`docs/specs/api/projects/delete.md`（エラー表から busy を消す）、`docs/specs/api/sessions/activate.md`（「busy を見ない」の表現）、`docs/specs/architecture/question-flow.md`（phase=proposed と配信の時点）
- `docs/adr/0022-no-one-swallows-a-response.md` — この change の design で提案し、2026-09-09 に承認を得て登録した ADR
- MCP ツールの契約は変えない。W1/W2 のメッセージの形も変えない——変わるのは配信の時点だけ
