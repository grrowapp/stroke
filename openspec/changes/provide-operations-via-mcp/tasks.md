# provide-operations-via-mcp Tasks

## 1. 土台

- [ ] 1.1 `@modelcontextprotocol/sdk` と `zod` を依存に追加する
- [ ] 1.2 `tools/mcp/` を作り、接続コンテキスト（stroke base URL / 本家 base URL / セッション id / プロジェクトパス）を env から読む口を実装する（design D3）
- [ ] 1.3 transport 非依存のハンドラ層の型（引数 + 接続コンテキスト → 結果）を定義する（design D2）

## 2. ツールハンドラ（endpoint 代行）

- [ ] 2.1 `overview`: `GET /api/strokes/:id/overview` への代行を実装する（specs `mcp/tools/overview`）
- [ ] 2.2 `strokes`: `GET /api/strokes/:id/strokes` への代行を実装する（specs `mcp/tools/strokes`）
- [ ] 2.3 `send-back`: `GET /api/strokes/:id/send-back` への代行を実装する。404 も素通しする（specs `mcp/tools/send-back`）
- [ ] 2.4 `submit`: 種別（question / proposal / steering-document）で代行先を振り分ける提出の一本口を実装する（specs `mcp/tools/submit`）
- [ ] 2.5 `steering`: 文書名引数の取得と文書状況の取得を実装する。projectId は `GET /api/projects/list` からプロジェクトパスで引き当てる（specs `mcp/tools/steering`、design D3）
- [ ] 2.6 エラー素通し（`{status, body}`）とネットワーク不達時のツールエラーを共通化する（design D5）

## 3. stdio エントリ

- [ ] 3.1 `tools/mcp/index.ts` に SDK の stdio Server を実装し、ハンドラ層を登録する（サーバー名 `stroke`、design D4）
- [ ] 3.2 単体で起動してツール列挙と各ツールの往復を確認する（specs `mcp/server`）

## 4. spawn 配線

- [ ] 4.1 `server/utils/stroke/invoke.ts`: セッション工程の呼び出しに操作系 MCP サーバーの `--mcp-config` を足す（specs `agent/invocation`）
- [ ] 4.2 同 steering 工程の `mcpConfigFor` に、本家 MCP と並べて操作系サーバーを足す
- [ ] 4.3 接続情報が prompt に載っていないことを確認する（specs `agent/invocation` の Scenario）

## 5. テストと検証

- [ ] 5.1 ハンドラ層の単体テスト（代行先 URL・素通し・振り分け）を追加する
- [ ] 5.2 セッション工程の実機確認: 起動した claude からツール一覧が見え、`overview` の取得と `submit`（question）の提出が通る
- [ ] 5.3 steering 工程の実機確認: `steering` の取得と `submit`（steering-document）の書き込みが通る
- [ ] 5.4 既存スキル経路が無変更で動くこと（併存）を確認する
