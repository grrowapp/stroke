## 1. 起動単位の提出記録を持つ

- [x] 1.1 `server/utils/stroke/submission-signal.ts` に**起動単位**の記録を足す（既存の `counts` とは別の写像。記録する / 記録があるか / 捨てる の3つ）
- [x] 1.2 同ファイルの冒頭に、キーの取り方が2つある理由を書く（flontier は受理する endpoint が対象の id で数える／steering は代行先が本家なのでツールが起動の token で数える）
- [x] 1.3 既存の `notifySubmission` / `submissionCount` / `forgetSubmissions` の振る舞いを変えていないことを確かめる（flontier 側は変更対象外）

## 2. 受理された steering の提出を数える

- [x] 2.1 `server/utils/mcp/connection-table.ts` の `ConnectionResolution` の成功側に `token` を足す（失敗側は変えない。既存の呼び出し元は `ok` と `context` しか見ないので影響しないことを確認する）
- [x] 2.2 `server/mcp/tools/submit-document.ts` の steering 分岐で、**本家 PUT が応答を返して受理された経路だけ**で 1.1 の記録を行う
- [x] 2.3 数えない経路を確認する — 手前で弾いた 400（`isRoutableDocumentName` / `type` 不正）・`connection_mismatch`・`project_not_registered`・`classifySteeringFailure` に落ちた失敗のいずれでも記録しない
- [x] 2.4 flontier 分岐では記録しない（受理を数えるのは A7 側。二重に数えない）
- [x] 2.5 ツールの結果に項目を足していない・`status` / `errorCode` / `error` の値を変えていないことを確かめる（`docs/specs/api/mcp-tools.md` の契約は変えない）

## 3. steering の実行に「作業が行われたか」を持たせる

- [x] 3.1 `server/utils/stroke/invoke.ts` の steering 分岐に `didWork` を渡す（`options.token` で 1.1 の記録を読む）
- [x] 3.2 `kick` の `.finally` で `removeConnection(token)` と並べて記録を捨てる。`buildRun` が同期 throw する経路（`removeConnection` を呼んでいる catch）でも捨てる
- [x] 3.3 flontier 分岐の `submittedSince(sessionId)` は変えない
- [x] 3.4 `server/plugins/01.retry-failed.ts` と `server/utils/stroke/sweep.ts` は変えない（`failed` を拾う条件のままで、空振りが `failed` になれば既存の経路に乗る）
- [x] 3.5 `server/utils/stroke/sweep.ts` の docstring が巡回の実体を `server/plugins/02.retry-failed.ts` と書いている誤記を、実体（`01.retry-failed.ts`）に直す

## 4. テスト

- [x] 4.1 `test/server/utils/stroke/invoke.test.ts` — steering の起動が `didWork` を持つこと、flontier の `didWork` が変わっていないこと
- [x] 4.2 `test/server/utils/stroke/invoke.test.ts` — 実行が終わると記録が残らないこと（次の起動が前の起動の提出を数えない）
- [x] 4.3 `test/server/mcp/tools/submit-document.test.ts` — 本家が受理した steering の提出が起動の作業として記録されること
- [x] 4.4 `test/server/mcp/tools/submit-document.test.ts` — 拒否・不達・手前で弾いた提出、および flontier の提出では記録されないこと
- [x] 4.5 `test/server/mcp/tools/submit-document.test.ts` — 記録を足しても結果の形（`status` のみ／失敗時の `status`・`errorCode`・`error`）が変わらないこと
- [x] 4.6 `test/server/utils/stroke/ai.test.ts` — 「正常終了したが作業なし → `failed`」の既存のケースが steering の値でも成立すること
- [x] 4.7 `yarn test` が通ること（既存のテストを1つも壊していない）
- [x] 4.8 `yarn lint` と型検査が通ること — `yarn lint` はこのリポジトリに存在しない（CLAUDE.md）。`yarn typecheck` は通した

## 5. 実機で確かめる

- [ ] 5.1 承認から steering を起こし、文書を提出して終わる実行が `idle` になることを確かめる（`state.json` の `invocation`）
- [ ] 5.2 何も提出せずに終わる実行（例: 本家 dashboard を止めて起こす）が `idle` にならず `failed` になり、巡回に拾われることを確かめる
- [ ] 5.3 起こし直しが上限に達したら `error` になり、そこで自動の起こし直しが止まることを確かめる
- [ ] 5.4 使ったプロセス・ポート・作った検証用セッションを片づける
  - （2026-09-01 追記: 使ったプロセス（`yarn dev` PID 379862）とポート（3599）は停止・解放を確認済み（`ss -tlnp` 該当なし、`ps -p` 該当なし）。ただし作った検証用セッション（`/opt/projects` 配下）の片付けはユーザー確認待ちのため未実施）

## 6. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 6.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `S3` / `S4`。ファイル名の誤記〔`01.reap-running.ts` → `01.retry-failed.ts`〕は同 ticket の「同時に見つかった既存の誤り」一覧に `D2` として記録済み）。**この change では `docs/` を書き換えない**

## 7. 仕上げ

- [ ] 7.1 この change の成果物を commit する（`openspec/config.yaml` の apply guidance）
- [ ] 7.2 `typescript-reviewer` エージェントに `/santa-method` でレビューさせ、**完全にパスするまで**指摘の修正とレビューを繰り返す
- [ ] 7.3 ユーザーから完了承認を得る
