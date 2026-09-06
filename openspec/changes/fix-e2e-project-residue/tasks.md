## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-e2e-project-residue.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する。既に同じ物があれば追記しない。`tags` は追記のみで既存の項目を消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 後始末の失敗を握り潰さない（specs「後始末の失敗は握り潰さない」・design D1）

- [x] 2.1 `test/e2e/proposal-persistence.spec.ts` の `afterEach` から `.catch(() => undefined)` を外し、セッションの削除・プロジェクトの削除のそれぞれで、応答が 2xx 以外なら対象・status・本文を含む `Error` を投げる
- [x] 2.2 プロジェクトの削除の直前に `GET /api/strokes/:name` で対象が在ることを確かめる。GET が 404 なら削除しない。削除の 404 はその後に限り「済んでいる」と読む

## 3. 実行は既知の保存先から始まる（specs「実行は既知の保存先から始まる」・design D2）

- [x] 3.1 `playwright.config.ts` の種まき（`ACTIVE`/`DISCONNECTED` のディレクトリ作成、承認まで進んだセッション、registry の書き出し）を関数 `seedStore` に切り出し、config のトップレベルからの呼び出しは残す
- [x] 3.2 種まきの直前で `E2E_ROOT`（`.e2e-tmp`）を丸ごと消す。ただし `TEST_PARALLEL_INDEX` が無い（本体プロセスの）評価に限る。消す対象が `E2E_ROOT` の下であることは `refuseRealTargets()` が保証しているので、ここで検査を重ねない（design D2、2026-09-06 に `globalSetup` から改めた）
- [x] 3.3 消す処理を `globalSetup` に置かない理由（`webServer` が先に立つ）と、worker で消さない理由（worker でも評価される）をコメントに書く
- [x] 3.4 `.e2e-tmp/projects/` に承認済みのディレクトリを手で置いた状態で `yarn test:e2e test/e2e/projects.spec.ts` を回し、行数が 3 のままであること（残りが一覧に現れないこと）を確かめる

## 4. 原因の記録と検証（design D3）

- [ ] 4.1 `yarn build` の後に `yarn test:e2e` を full で回す。`proposal-persistence.spec.ts` が赤なら、出た status と本文を ticket の「追記」に日付付きで書く。対処はこの change で行わない
- [ ] 4.2 full run の後に `.e2e-tmp/projects/` を見て、`e2e-proposal-approved-*` の有無を ticket に書く
- [ ] 4.3 `yarn typecheck` と `yarn test` が通ることを確かめる

## 5. レビュー

- [ ] 5.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。指摘が出たら直して再レビューし、完全にパスするまで続ける

## 6. 完了

- [ ] 6.1 change の成果物を commit する
- [ ] 6.2 ユーザーから完了承認を得て、`openspec/tickets/fix-e2e-project-residue.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
