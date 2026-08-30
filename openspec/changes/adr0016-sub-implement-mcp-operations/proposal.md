# adr0016-sub-implement-mcp-operations

## Why

`provide-operations-via-mcp` の第一段では、MCP ツールは既存 REST endpoint への代行（薄いプロキシ）に留めて方式を固めた。次の段として、MCP ツール自体が実際の処理を実装し、自プロセス→自サーバーへの HTTP 往復を外す。transport の Nitro（Streamable HTTP）への載せ替えも、この実処理化とあわせて判断する。

## What Changes

- **変更**: MCP ツールのハンドラ実装を、endpoint への HTTP 発行（代行）から実処理（サーバー内部の実装の直接呼び出し）へ置き換える。ツールの契約（名前・引数・応答）は変えない
- **検討**: transport を stdio から Nitro の Streamable HTTP endpoint へ載せ替えるかを判断し、採る場合は実施する（`provide-operations-via-mcp` でハンドラは transport 非依存に分離済み）
- 前提: `provide-operations-via-mcp` の完了。`adr0016-sub-switch-workflow-to-mcp-tools` により入口が MCP ツールへ一本化されていることが望ましい

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `mcp/server`: 提供方式（代行か実処理か・transport）の要求が変わる範囲を specs 段で精査する。
- `mcp/tools/overview`・`mcp/tools/strokes`・`mcp/tools/send-back`・`mcp/tools/submit`・`mcp/tools/steering-read`: 契約は維持し、代行先の規定（endpoint への素通し）が実処理の規定に変わる。

## Impact

- MCP サーバー実装一式（ハンドラの中身）
- `server/utils/` の既存実装（実処理の呼び出し先として共有化する範囲）
- transport を載せ替える場合は Nitro（`server/`）と起動配線（`agent/invocation` 側の `--mcp-config`）
