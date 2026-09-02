## 1. 順序の取り決めをコードから外す

- [x] 1.1 `server/utils/stroke/reap-gate.ts` を削除する
- [x] 1.2 `test/server/utils/stroke/reap-gate.test.ts` を削除する
- [x] 1.3 `server/plugins/01.retry-failed.ts` から `awaitReap` の import・呼び出し（`kickoff` 内の `await awaitReap()`）を外し、docblock の「## 最初の周回は後始末の完了を待つ」節を削除する
- [x] 1.4 `server/plugins/01.reap-running.ts` から `beginReap` の import・呼び出しを外す。`task` を `beginReap` に渡すためだけに組んであるラップ（`reap().catch(...)` の再 throw と二重 `catch`）を、単純な `void reap().catch(error => console.error(...))` へ簡略化する。docblock の門についての記述（「巡回プラグインは、この完了を `reap-gate.ts` の門で待ってから最初の周回を始める」等）も外す。design.md Decision 3（proposal.md の Impact に無かった箇所）
- [x] 1.5 `server/utils/stroke/reap.ts` の docblock を更新する。`terminateProcess` の「確かめてから `failed` を書く」の引用先を、正しい当て先（`fix-orphan-run-on-restart` が `agent/invocation` に足す Requirement。同 change archive 後は canonical `agent/invocation`）へ直す。design.md Decision 4
- [x] 1.6 `server/plugins/01.retry-failed.ts` の docblock に、順序の取り決めを持たない理由（対象1件ごとの順序で足りる）の参照として `agent/invocation`「起動時の後始末と巡回は、互いの完了を待たない」を足す

## 2. `fix-orphan-run-on-restart` の artifact を修正する

- [x] 2.1 `openspec/changes/fix-orphan-run-on-restart/specs/agent/invocation/spec.md` の35行目、MUST NOT の1文（「後始末が済むまで、その対象への起動を行ってはならない（MUST NOT）。起こし直しの巡回も、ユーザーの操作による起動も、後始末の後に行う。」）を削除する
- [x] 2.2 同ファイル 63〜67行目、Scenario「後始末より先に起こし直さない」を削除する
- [x] 2.3 `openspec/changes/fix-orphan-run-on-restart/tasks.md` の 4.5 を、「後始末が済むまで巡回が U13 を叩かない」ではなく、対象1件ごとの順序（`reap.ts` の `reapRunning` が終了を確かめてから `failed` を書く分岐）を固定したものである旨に差し替える。既存のテストファイル名・確認済みの記述はそのまま活かし、参照先の理解だけを訂正する

## 3. テスト

- [x] 3.1 `reap-gate.ts` を参照していたテスト以外（`reap.test.ts` 等、`reapRunning` / `terminateProcess` を直接検証するテスト）が、削除後も変更なく通ることを確認する —— `test/server/utils/stroke/reap.test.ts` は無変更で全件通過（`yarn test` の804件に含まれる）
- [x] 3.2 `yarn test` を実行し全件通過を確認する。起動したプロセス・作ったセッションは必ず片づける —— 67 files / 804 tests 全件通過（exit code 0）。vitest 以外のプロセスは起動していない
- [ ] 3.3 `yarn check:stroke` を実行し、起動時の後始末と巡回が引き続き正しく動く（後始末が `running` を畳み、巡回が `failed` を拾って起こし直す）ことを確かめる。起動したものは必ず停止する —— ユーザー指示により実行しない（実機を1周させるタスク・dev サーバー起動禁止のため停止・報告）

## 4. ticket

- [x] 4.1 `openspec/tickets/remove-startup-reap-ordering.md` の frontmatter `status` を進める（`docs/agents/ticket-labels.md`）—— 同ファイルが持つ状態は `Open` / `Planning` / `Doing` / `Wait-for-archive` の4値だけで `Tasks` は無い（本タスクの文言が古い）。`Doing` は「`openspec apply` を実行するとき、その最初に」書く値と規定されており、apply 手順の指示どおり着手時点で `Planning` → `Doing` に変更済み

## 5. レビューと完了

- [ ] 5.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせる。完全にパスするまで繰り返す
- [ ] 5.2 ユーザーから完了承認を得る
