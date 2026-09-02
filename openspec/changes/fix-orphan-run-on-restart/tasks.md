## 1. 着手

- [x] 1.1 ticket（`openspec/tickets/fix-orphan-run-on-restart.md`）の `status` を `Doing` に変え、`tags` へ `fix-orphan-run-on-restart/7f3786e2-2ad8-436d-8728-cc8b6be087ed` を追記する

## 2. 実装と artifact の照合

**実装は artifact に先行して入っている**（ticket「実装の現状」）。artifact を起こし直したので、合っているかを1件ずつ確かめる。合っていない箇所は実装を artifact へ寄せる。

- [x] 2.1 `specs/bootstrap/system/cleanup-agent-process/spec.md` の Requirement「起動のたびに残った実行を後始末する」と `server/plugins/01.reap-running.ts` を突き合わせる。起動ごとに1回だけ走ること、対象0件で何もしないことを確かめる
- [x] 2.2 Requirement「走っている claude を終了させてから記録を畳む」と `server/utils/stroke/reap.ts` を突き合わせる。**終了を確かめてから `failed` を書く順序**になっていることを確かめる
- [x] 2.3 Requirement「終わらせられなかった実行は error にする」と `reap.ts` の分岐を突き合わせる。終了させられない・確かめられない・プロセス一覧を取れない、の3経路がすべて `error` になることを確かめる
- [x] 2.4 Requirement「起こしたインスタンスを判定条件にしない」と `server/utils/stroke/reap-match.ts` を突き合わせる。インスタンスを見る判定（`isOwnLaunch` 相当）が残っていないことを確かめる
- [x] 2.5 design.md 決定6（後始末と巡回の間に順序の取り決めを持たない）と `server/plugins/01.retry-failed.ts` を突き合わせる。待ち合わせの仕組みが無いこと、巡回が `running` を拾わないことを確かめる
- [x] 2.6 `specs/agent/invocation/spec.md` の MODIFIED と実装を突き合わせる。記録の書き込みが A8 を通ること、claude と画面がそこへ到達できないことを確かめる

## 3. 実装に残っている食い違いを直す

- [x] 3.1 `server/utils/stroke/sweep.ts` の docblock（15〜16行目）を直す。「`01.retry-failed.ts` の初回の刈り取りが前のプロセスの残骸（`running`）をこの値へ倒す」は事実と違う——初回の刈り取りは切り出し済みで、`running` を倒すのは起動時の後始末である
- [x] 3.2 実装コード中に残っている、削除済み artifact（`design.md` の旧 Decision 番号・旧 `tasks` 番号）への参照が無いことを確かめる。在れば消す
- [x] 3.3 実装コードが参照する capability 名を、新しい `bootstrap/system/cleanup-agent-process` に合わせる

## 4. startup-readiness の削除に実装を沿わせる

**残す振る舞いは `api/session/invoke-agent` の「前提が欠けている間は起動を受け付けない」だけ。** 起動時の検査は仕様から消えるので、実装からも消す。

- [x] 4.1 `server/plugins/00.startup-checks.ts` を削除する。起動時に確かめる理由が3点とも無い（proposal「Removed Capabilities」）
- [x] 4.2 `server/utils/readiness.ts` の `missingPrerequisites()` は**残す**。`server/api/strokes/[id]/invoke-agent.get.ts:38` が使っており、そちらは `api/session/invoke-agent` が規定している。docblock から `specs/startup-readiness` と `design.md 決定2` への参照を消す
- [x] 4.3 `openspec/specs/api/session/invoke-agent/spec.md` 47行目の「前提（startup-readiness）」から、消える capability への参照を外す
- [x] 4.4 `docs/adr/0010-create-button-always-enabled.md` の2箇所（13行目・25行目）の `startup-readiness` への参照を外す
- [ ] 4.5 進行中 change `scope-storage-requirements`（proposal.md・specs/configuration/spec.md）と `align-settings-conventions`（design.md）の参照を外す
- [x] 4.6 `docs/adr/0003-settings-precedence.md` 48行目「倒れたことは起動時チェック（`server/plugins/00.startup-checks.ts`）が示す」を直す。示す場所が AI の起動要求の応答に移る
- [x] 4.7 `docs/specs/core/server-structure.md` 14行目の `readiness`（直下）の記載を確かめる。関数は残るので変更不要の見込み
- [x] 4.8 `00.startup-checks.ts` を対象にしたテストが在れば消す。`missingPrerequisites()` のテストは残す（`test/server/api/strokes/invoke-agent.get.test.ts`・`invoke-agent.multiplex.test.ts` は invoke-agent 経由なので残る）
- [x] 4.9 archive 内の参照（`remove-startup-exit`・`connect-portal-and-strokes`）は**触らない**。過去の記録である

## 5. 上位資料への整合反映

`docs/specs/architecture/session-workflow.md`「実行の記録（`invocation`）」。

- [x] 5.1 91〜92行目「書き込みは A8 経由で invokeAi だけが行う」から、書き手を invokeAi だけに限る記述を外す。`agent/invocation` の MODIFIED に合わせる
- [x] 5.2 113〜114行目の「自分が起こしたものか判定できない場合」を削る。所有判定が無くなったので条件として成立しない
- [x] 5.3 115〜116行目「他インスタンスが起こした実行には触らない」の項目を削除する。決定5 で判定条件にしないと決めた
- [x] 5.4 状態遷移図の `running --> error: 起動時に後始末できない` と、後始末のファイル名の記述が正しいままであることを確かめる（既に正しい想定。変更不要なら何もしない）

## 6. テスト

- [x] 6.1 `test/server/utils/stroke/reap.test.ts` が、specs の Scenario と1対1で対応しているかを確かめる。対応の無い Scenario があればテストを足す
- [x] 6.2 `test/server/utils/stroke/reap-match.test.ts` が、**起動側の組み立て（`invoke.ts` / `claude.ts`）と同じ事実を見ていること**を固定していることを確かめる（design.md Risks）
- [x] 6.3 `yarn typecheck` を通す
- [x] 6.4 `yarn test` を通す

## 7. 完了

- [ ] 7.1 変更の一式をこのブランチへコミットする
- [ ] 7.2 ユーザーへ完了を報告し、承認を得る。承認を得たら ticket の `status` を `Wait-for-archive` に変える
