# mcp/server Delta

## Purpose

stroke-board 自身が route `/mcp` で提供する MCP サーバーの、全ツール共通の契約を定める。個々のツールの引数・結果は `mcp/tools/**`、接続の担保は `server/session-management` にある。

## ADDED Requirements

### Requirement: MCP は stroke-board 自身の route で提供される

MCP サーバーは stroke-board の route `/mcp`（Streamable HTTP）で提供される SHALL。別プロセスを立ててはならない（MUST NOT）。提供するツールは `get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering` の6本とする SHALL。

#### Scenario: 6ツールが列挙される

- **GIVEN** stroke-board が起動済みである
- **WHEN** Nuxt DevTools の MCP Inspector で `/mcp` のツール一覧を開く
- **THEN** 6ツールがすべて列挙されている

### Requirement: 結果は status と errorCode のフラットな形で返す

各ツールの結果は1階層とし、常に `status`（endpoint の応答の HTTP ステータスコード）を持つ SHALL。失敗時は `errorCode`（機械可読の失敗種別。本家 dashboard に到達できない場合は `unreachable`）と `error`（endpoint が返したエラー本文）を持ち、成功時はそのツールの結果スキーマの項目を持つ SHALL。エラー本文を書き換え・省略・追加してはならない（MUST NOT）。MCP サーバー独自の事前検証・状態分岐を足してはならない（MUST NOT）（docs/adr/0013 の原則に整合する）。

#### Scenario: 結果スキーマが形に従っている

- **GIVEN** stroke-board が起動済みである
- **WHEN** Nuxt DevTools の MCP Inspector で各ツールの結果スキーマの定義を開く
- **THEN** すべてのツールで `status` が必須項目にあり、失敗時の `errorCode` / `error` が定義されている
