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
- [ ] 5.4 `test/e2e/` のうち A5・A7 の受理で画面が変わることを前提にしているものを、決着で変わる形へ直す

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
- [ ] 9.3 E2E に「proposal の提出では画面2 が開かない → 実行の決着で開く → 承認 → 改名の時点で対象に実行が無い」を足して通す
- [x] 9.4 `openspec validate --all` が通る — **本 change は valid。** 全体は 71/80 で、失敗する 9 件（`create-feature`・`create-spec-document`・`fix-agent-question-api-path`・`fix-retry-count-without-launch`・`fix-submit-document-project-name`・`reorganize-server-utils`・`spec-document-management`・`update-changes-operation-flow`・`view-openspec-changes`）はいずれも **specs delta をまだ書いていない別の進行中 change** で、本 change とは無関係の既存の状態である（`proposal.md` か `README.md` だけ、または空）
- [ ] 9.5 `yarn check:stroke` を実機で1周通す。承認の手前で実行の終わりを待つ仕掛けが不要になっていることを確かめ、不要なら外す

## 10. 完了

- [ ] 10.1 実装が specs delta のすべての Requirement を満たすことを確かめ、ユーザーへ完了の承認を求める
- [ ] 10.2 承認を得たら ticket の `status` を `Wait-for-archive` に書き換える
