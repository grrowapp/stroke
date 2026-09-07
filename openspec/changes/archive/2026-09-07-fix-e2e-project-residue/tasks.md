## 1. 着手の記録

- [x] 1.1 `openspec/tickets/fix-e2e-project-residue.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する。既に同じ物があれば追記しない。`tags` は追記のみで既存の項目を消さない（`docs/agents/issue-tracker.md`「ticket の起票」）

## 2. 後始末の失敗を握り潰さない（specs「後始末の失敗は握り潰さない」・design D1）

- [x] 2.1 `test/e2e/proposal-persistence.spec.ts` の `afterEach` から `.catch(() => undefined)` を外し、セッションの削除・プロジェクトの削除のそれぞれで、応答が 2xx 以外なら対象・status・本文を含む `Error` を投げる
- [x] 2.2 プロジェクトの削除の直前に `GET /api/strokes/:name` で対象が在ることを確かめる。GET が 404 なら削除を送らず済んだと扱う。在ると確かめた後の削除は 404 も含めて 2xx 以外を失敗にする（レビュー指摘で改めた。design D1）。要求そのものの失敗でも配列を空に戻す（`try/finally`）

## 3. 実行は既知の保存先から始まる（specs「実行は既知の保存先から始まる」・design D2）

- [x] 3.1 `playwright.config.ts` の種まき（`ACTIVE`/`DISCONNECTED` のディレクトリ作成、承認まで進んだセッション、registry の書き出し）を関数 `seedStore` に切り出し、config のトップレベルからの呼び出しは残す
- [x] 3.2 種まきの直前で `E2E_ROOT`（`.e2e-tmp`）を丸ごと消す。ただし `TEST_PARALLEL_INDEX` が無い（本体プロセスの）評価に限る。消す先の所在は `E2E_ROOT` の定義で固定する——設定ファイルの隣の `.e2e-tmp` から組み、`process.cwd()` に依存させない（design D2、2026-09-06 に `globalSetup` から改め、レビュー指摘で `E2E_ROOT` の組み方も改めた）
- [x] 3.3 消す処理を `globalSetup` に置かない理由（`webServer` が先に立つ）と、worker で消さない理由（worker でも評価される）をコメントに書く
- [x] 3.4 `.e2e-tmp/projects/` に承認済みのディレクトリを手で置いた状態で `yarn test:e2e test/e2e/projects.spec.ts` を回し、行数が 3 のままであること（残りが一覧に現れないこと）を確かめる

## 3b. steering の実行が終わるのを待ってから消す（specs「対象が実行中で、待てば消せる」・design D4。原因確定後にユーザーの決めで追加）

- [x] 3b.1 2.2 の存在確認の後に DELETE を送り、応答が `reason: busy` の 409 である間だけ上限付き（5秒、100ms 間隔）で出し直す。上限に達したら、待ちきれなかったことと最後の応答を含めて失敗にする（当初は `invocation` を待つ形だったが、観測点が busy の事実とずれるためレビュー2周目で改めた。design D4）
- [x] 3b.2 `yarn test:e2e test/e2e/proposal-persistence.spec.ts test/e2e/projects.spec.ts --repeat-each 3` で承認テストが安定して緑であることを確かめ、run の後に `.e2e-tmp/projects/` に `e2e-proposal-approved-*` が無いことを見る（69 passed、残骸無し）

## 4. 原因の記録と検証（design D3）

- [x] 4.1 `yarn build` の後に `yarn test:e2e` を full で回す。`proposal-persistence.spec.ts` が赤なら、出た status と本文を ticket の「追記」に日付付きで書く。対処は当初この change で行わない予定だった（3b で追加）（結果: 242 passed / 1 failed。`proposal-persistence` は4件とも緑。失敗は `approval-annotation.spec.ts:768` の timeout で範囲外。ticket に記録）
- [x] 4.2 full run の後に `.e2e-tmp/projects/` を見て、`e2e-proposal-approved-*` の有無を ticket に書く（無し）
- [x] 4.3 `yarn typecheck` と `yarn test` が通ることを確かめる（typecheck exit 0、vitest 77 files / 977 tests 全通過）

## 5. レビュー

- [x] 5.1 `typescript-reviewer` エージェントに `/santa-method` でレビューを実行させる。指摘が出たら直して再レビューし、完全にパスするまで続ける（`typescript-reviewer` は無いため general-purpose の独立 reviewer 2本で実施。5周目で両者 PASS。途中の指摘で改めた点: E2E_ROOT の組み方、GET 確認後の 404 の扱い、待ちの観測点、ticket の時系列）

## 6. 完了

- [x] 6.1 change の成果物を commit する（pre3 ブランチ。`playwright.config.ts` と `test/e2e/proposal-persistence.spec.ts`。openspec の artifact と ticket は親に未コミットで維持）
- [x] 6.2 ユーザーから完了承認を得て、`openspec/tickets/fix-e2e-project-residue.md` の `status` を `Wait-for-archive` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
