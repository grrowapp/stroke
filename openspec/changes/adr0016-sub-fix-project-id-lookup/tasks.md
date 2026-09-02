## 1. 現状の固定

- [x] 1.1 `test/server/utils/mcp/resolve-project-id.test.ts` の既存8件が緑であることを `yarn test` で確認し、これから守る振る舞いの基準線にする
- [x] 1.2 `server/utils/mcp/resolve-project-id.ts` の `normalizePath`（`resolve()` による `.` / `..` の畳み込みと末尾スラッシュの除去）が、変更後も両側に効き続けることを確認する範囲を洗い出す

## 2. 照合の変更（specs `upstream-connection`「パスから本家の projectId を引き当てる」）

- [x] 2.1 一覧のエントリを候補に絞る述語を書く — 正規化後の `projectPath` が、正規化後の要求パスと同じか、その祖先であること。判定はパス構成要素の境界で行い、文字列の前方一致にしない（`/opt/projects/example` が `/opt/projects/example-2` を拾わない）
- [x] 2.2 候補が複数あるとき、`projectPath` の構成要素数が最も多いものを1つ採る。深さが同じ候補が並ぶ（本家の一覧に同じパスが二重に載っている）ときは従来どおり一覧の先頭側を採り、新しい失敗を作らない
- [x] 2.3 本家のパス解決手続き（`git rev-parse --show-toplevel` 等）をこちら側で再実行していないこと、登録簿ファイル（`activeProjects.json`）を読んでいないことを実装で担保する
- [x] 2.4 関数の docstring を design の D1 / D2 に合わせて書き直す — なぜ祖先を許すのか、なぜ `workflowRootPath` と `deriveProjectId` を使わないのかを、根拠つきで残す

## 3. 失敗の伝え方（specs `mcp/server`「結果は status と errorCode のフラットな形で返す」）

- [x] 3.1 `ProjectNotRegisteredFailure` の `errorCode` は `project_not_registered` のまま据え置く。新しい `errorCode` を足さない（design D3）
- [x] 3.2 `error` 本文を、引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの名前とパスを含む形に組み立て直す
- [x] 3.3 一覧が空だった場合の本文を、候補があって外れた場合と区別できる文言にする
- [x] 3.4 `status` は 404 のまま、結果が1階層であることを崩していないことを確認する

## 4. テスト

- [x] 4.1 既存8件をそのまま通す（振る舞いの後退が無いこと）
- [x] 4.2 追加: 一覧に `/opt/projects` だけがあるとき `/opt/projects/example` が引き当たる（本家が git のトップレベルへ解決した場合）
- [x] 4.3 追加: 一覧に `/opt/projects` と `/opt/projects/example` があるとき `/opt/projects/example/sub` は後者に引き当たる（最深）
- [x] 4.4 追加: 一覧に `/opt/projects/example` だけがあるとき `/opt/projects/example-2` は引き当たらない（前方一致の除外）
- [x] 4.5 追加: 候補があって外れたときの `error` に、要求パスと一覧のプロジェクト名・パスが含まれる
- [x] 4.6 追加: 一覧が空のときの `error` が 4.5 の本文と区別できる
- [x] 4.7 `yarn test` と `yarn lint`（型検査を含む）を通す — `yarn lint` は package.json に存在しない（scripts は typecheck/test/spec/check のみ）。CLAUDE.md「実行は package.json の scripts 経由」に従い `yarn typecheck` を代わりに実行した。既存の失敗4件（`canvas-confetti` の型が無い。`app/components/project/CreationNotice.vue` 等）は本 change と無関係で、変更前から存在する（stash して再現を試みたが確認前にタイムアウトしたため、対象ファイルが `resolve-project-id.ts` を一切含まないことで無関係と判断）。`yarn test` は 58 ファイル 735 件すべて成功

## 5. 実機での確認

- [x] 5.1 dev を起動し、承認済みプロジェクトで steering 工程を1周させ、`get-steering` と `submit-document`（`type: steering`）が成功することを確認する（`projectShareRoot` は現状のまま = git 管理外）
  - （実測 2026-09-01: dev(3599) で `yarn check:stroke --approve` を2周。両周とも承認 → steering 着地。steering 実行で `get-steering` 3回・`submit-document`（`type: steering`）3回が成功し、文書3本が揃った）
- [ ] 5.2 一覧に対応しないパスで引き当てを失敗させ、`error` 本文から「一覧に何があったか」が読めることを確認する
- [ ] 5.3 起動したプロセス・作ったセッションを片付け、ポートの解放を確認する
  - （実測 2026-09-01: 起動していた `yarn dev`（PID 379862、3599）を `kill -TERM` で停止。`ss -tlnp | grep 3599` 該当なし＝ポート解放、`ps -p 379862` 該当なし＝プロセス停止を確認した。ただし作ったセッション・プロジェクトの片付け（`/opt/projects` 配下）はユーザー確認待ちのため未実施）

## 6. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲済み）

- [x] 6.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。提案の内容は同 change の ticket に一覧（この change の分は `U1` / `M2`）。**この change では `docs/` を書き換えない**
- [x] 6.4 基準版の食い違い（資料と ADR-0008 は 2.2.7、実体は 2.2.5）を報告し、この change で扱うか別立てにするかの判断を仰ぐ（`update-docs-for-runtime-fixes` の ticket に `D4` として記録済み。扱いはユーザー判断待ち）

## 7. 締め

- [ ] 7.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせ、完全にパスするまで指摘の反映とレビューを繰り返す
- [ ] 7.2 ユーザーから完了承認を得る
