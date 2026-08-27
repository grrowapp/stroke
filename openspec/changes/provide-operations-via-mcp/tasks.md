# provide-operations-via-mcp Tasks

## 1. モジュール導入

- [ ] 1.1 `@nuxtjs/mcp-toolkit` を依存に追加し、lockfile でバージョンを固定する
- [ ] 1.2 `nuxt.config.ts` の modules に追加する（route は既定 `/mcp`、`dir` は既定のまま）
- [ ] 1.3 Nuxt DevTools の MCP Inspector で `/mcp` が開けることを確認する

## 2. セッション管理（接続表と token）

- [ ] 2.1 接続表の util を `server/utils/` に追加する（`register` / `resolveConnection` / `remove`。メモリのみ・永続化しない。specs `server/session-management`、design の接続表エントリ: token / sessionId / projectPath）
- [ ] 2.2 `resolveConnection` は `x-stroke-token` ヘッダを照合し、欠落・不一致は 401 を throw する（既定値で補わない。ADR-0013）
- [ ] 2.3 接続表 util の単体テスト: 登録→照合→削除の一巡、欠落・不一致の拒否
- [ ] 2.4 ここまでの実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する

## 3. ツール定義（server/mcp/tools/）

- [ ] 3.1 `get-overview.ts`: A1 への代行。結果は `status: 200` + `overview` / 404 は `not_found`（specs `mcp/tools/overview`）
- [ ] 3.2 `get-strokes.ts`: U3 への代行。結果は `status: 200` + 時系列の記録一覧 / 404 は `not_found`（specs `mcp/tools/strokes`）
- [ ] 3.3 `get-send-back.ts`: A4 への代行。404 の errorCode は `no_send_back` / `session_not_found` で区別（specs `mcp/tools/send-back`）
- [ ] 3.4 `send-question.ts`: A5 への代行。構造化引数、成功 204、400 は `validation_error`、404 は `session_not_found`、409 は `phase_conflict`（specs `mcp/tools/question`）
- [ ] 3.5 `submit-document.ts`: 種別（flontier / steering）で A7 / 本家 PUT へ振り分け。失敗は種別によらずエラー形式、本家不達は `unreachable`（specs `mcp/tools/submit`）
- [ ] 3.6 `get-steering.ts`: 本家 GET への代行。結果に `exists`（本家 info の文書状況から）を含める。文書無しは 200 + `exists: false` + 空の文章、規定外名は 400 `validation_error`、不達は 502 `unreachable`（specs `mcp/tools/steering`）
- [ ] 3.7 projectId の解決: ツール実行時に本家 `GET /api/projects/list` からプロジェクトパスで引き当てる（design）
- [ ] 3.8 ツールハンドラの単体テスト: `$fetch` をモックし、結果整形（status / errorCode / error）を各パターンで検証
- [ ] 3.9 ツール6本の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する

## 4. spawn への配線（invoke.ts）

- [ ] 4.1 spawn 直前に一時 token（推測困難な乱数）を発行し、接続表へ登録する
- [ ] 4.2 mcp-config に `{ "type": "http", "url": "<apiBaseUrl>/mcp", "headers": { "x-stroke-token": <token> } }` を追加する（url は `runtimeConfig.claude.apiBaseUrl` から。既存フラグ・steering の本家 MCP の並びは変えない）
- [ ] 4.3 invokeAi の実行終了時（正常・異常とも）に接続表のエントリを削除する
- [ ] 4.4 配線の実装を santa-method でレビューし（独立2レビュアー）、両者合格まで修正する

## 5. 検証

- [ ] 5.1 MCP Inspector で6ツールの列挙と、結果スキーマ（status / errorCode / error）の定義を確認する（specs `mcp/server`）
- [ ] 5.2 token 無し・未発行 token の MCP 設定で外部から `claude -p` を起動し、ツール呼び出しが認可エラーで失敗する報告を確認する（specs `server/session-management`）
- [ ] 5.3 セッション2つを並走させ、`GET /api/strokes/:id/strokes` の記録が混ざらないことを確認する（specs `server/session-management`）
- [ ] 5.4 既存経路の無変更確認: 現行スキルでのストローク・steering 工程が従来どおり動く（ロールバックは mcp-config の追加分を外すだけ）

## 6. レビューと承認

- [ ] 6.1 全体を santa-method でレビューし（独立2レビュアー・共有コンテキストなし）、両者合格まで修正する
- [ ] 6.2 検証（5章）の結果を添えて approvals（dashboard）で承認を依頼し、approved を確認する。承認までは change の完了・archive に進まない
