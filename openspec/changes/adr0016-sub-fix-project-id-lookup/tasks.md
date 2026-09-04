## 1. ticket

- [x] 1.1 `openspec/tickets/adr0016-sub-fix-project-id-lookup.md` の `status` を `Doing` にする（`docs/agents/ticket-tracker.md`「ラベル設定」）
- [x] 1.2 同ファイルの `tags` に `<ブランチ名>/<セッション ID>` を追記する（`docs/agents/issue-tracker.md`「ticket の起票」）—— `fix-orphan-run-on-restart/42b86225-851f-4ec5-a58e-60a291d1877e`。あわせて必須項目 `origin: agent` の欠落を補い、`origin: agent` に要る「畳む方向」を書いた（2026-09-04）

## 2. 現状の固定

- [x] 2.1 `test/server/utils/mcp/resolve-project-id.test.ts` の既存8件が緑であることを `yarn test` で確認し、これから守る振る舞いの基準線にする
- [x] 2.2 `server/utils/mcp/resolve-project-id.ts` の `normalizePath`（`resolve()` による `.` / `..` の畳み込みと末尾スラッシュの除去）が、変更後も両側に効き続けることを確認する範囲を洗い出す

## 3. 引き当ての手順（specs `upstream-connection`「パスから本家の projectId を引き当てる」）

design.md D1。

- [x] 3.1 照合は `entries.find(...)` による完全一致のままとし、本家の解決でパスが変わった差を吸収する仕組みを持たない
- [x] 3.2 関数の docstring を書き直す —— なぜ差を吸収してはならないのか（差が出る場面では本家自身が複数のセッションを1つの projectId にまとめており、吸収すると別のセッションと共有の id を返す／「まだ登録されていない」を隠す）を根拠つきで残す
- [x] 3.3 本家のパス解決手続き（`git rev-parse --show-toplevel` 等）をこちら側で再実行していないこと、登録簿ファイル（`activeProjects.json`）を読んでいないことを実装で担保する
- [x] 3.4 なぜ `workflowRootPath` と `deriveProjectId` を使わないのか（design D2）を docstring に残す

## 4. 失敗の伝え方（specs `mcp/server`「結果は status と errorCode のフラットな形で返す」）

- [x] 4.1 `ProjectNotRegisteredFailure` の `errorCode` は `project_not_registered` のまま据え置く。新しい `errorCode` を足さない（design D3）
- [x] 4.2 `error` 本文を、引き当てに使ったパスと、そのとき一覧が持っていたプロジェクトの名前とパスを含む形に組み立て直す
- [x] 4.3 一覧が空だった場合の本文を、プロジェクトはあるが対応しない場合と区別できる文言にする
- [x] 4.4 `status` は 404 のまま、結果が1階層であることを崩していないことを確認する

## 5. テスト

- [x] 5.1 既存8件をそのまま通す（振る舞いの後退が無いこと）
- [x] 5.2 一覧にプロジェクトはあるが対応しないときの `error` に、要求パスと一覧のプロジェクト名・パスが含まれる
- [x] 5.3 一覧が空のときの `error` が 5.2 の本文と区別でき、`status: 404` / `errorCode: project_not_registered` は同じであることを検証する（santa-method レビュー 1周目の指摘、2026-09-04）
- [x] 5.4 `yarn test` を通す。`yarn lint` は `package.json` に存在しない（scripts は typecheck / test / spec / check のみ）ため `yarn typecheck` を代わりに実行する

## 6. 実機での確認

- [x] 6.1 dev を起動し、承認済みプロジェクトで steering 工程を1周させ、`get-steering` と `submit-document`（`type: steering`）が成功することを確認する（`projectShareRoot` は現状のまま = git 管理外）
  - （実測 2026-09-01: dev(3599) で `yarn check:stroke --approve` を2周。両周とも承認 → steering 着地。steering 実行で `get-steering` 3回・`submit-document`（`type: steering`）3回が成功し、文書3本が揃った。**この確認は照合を緩めた版で行っている。** 完全一致に戻した後の再確認が 6.2 に要る）
- [ ] 6.2 完全一致の実装で 6.1 と同じ1周が通ることを確認する。あわせて、一覧に対応しないパスで引き当てを失敗させ、`error` 本文から「一覧に何があったか」が読めることを確認する
- [ ] 6.3 起動したプロセス・作ったセッションを片付け、ポートの解放を確認する
  - （実測 2026-09-01: 起動していた `yarn dev`（PID 379862、3599）を `kill -TERM` で停止。`ss -tlnp | grep 3599` 該当なし＝ポート解放、`ps -p 379862` 該当なし＝プロセス停止を確認した。ただし 6.1 で作ったセッション・プロジェクト（`/opt/projects` 配下）の片付けはユーザー確認待ちのため未実施）

## 7. 上位資料への整合反映（change update-docs-for-runtime-fixes へ委譲。決着済み）

- [x] 7.1 上位資料への整合反映を change `update-docs-for-runtime-fixes` へ委譲した。**この change では `docs/` を書き換えない**
- [x] 7.2 `U1`（`upstream-observations.md` に「登録されるパスは git のトップレベルへ解決される」の節）—— **反映済**
- [x] 7.3 `M2`（`docs/specs/mcp/tools.md` の `errorCode` 表の意味列）—— **見送り**。ユーザー判断で不要とされた
- [x] 7.4 基準版の食い違い（資料と ADR-0008 は 2.2.7、実体は 2.2.5）—— `D4` として **反映済**
- [x] 7.5 `docs/adr/0016-delegate-provide-operations-via-mcp.md` の `#### adr0016-sub-fix-project-id-lookup` 節を直す（design.md 提案3）—— **ユーザー承認を得て 2026-09-04 に実施**（ADR-0004 の手続き）。「対処」を「照合は完全一致のままとし、本家の解決でパスが変わった差を吸収しない」へ差し替え、採らなかった理由を1段落足した。「成果物」を proposal のみ → proposal・specs（2本）・design・tasks へ更新。santa-method レビュー 1周目の指摘

## 8. 締め

- [ ] 8.1 `typescript-reviewer` エージェントに `/santa-method` でレビューさせ、完全にパスするまで指摘の反映とレビューを繰り返す
- [ ] 8.2 change の成果物を commit する
- [ ] 8.3 ユーザーから完了承認を得て、`openspec/tickets/adr0016-sub-fix-project-id-lookup.md` の `status` を `Wait-for-archive` にする
