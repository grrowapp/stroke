# adr0016-sub-document-mcp-operations

## Why

`provide-operations-via-mcp` は MCP サーバーと操作ツールを導入するが、その change 自体は `docs/` を触らない決定とした。定義としての specs の置き場（`docs/specs/`）に MCP 操作系の資料が無いままだと、実装とドキュメントが食い違う。文書化を独立した change として行う。

## What Changes

- **新規**: `docs/specs/` に MCP 操作系の定義資料を作成する（ツール一覧・各ツールの契約・配線。ファイル構成は design / tasks で確定）
- **変更**: 起動定義に増えた設定を `docs/specs/core/settings-reference.md` へ追記する（ADR-0004 の手続きに従う）
- **新規**: 「操作系は endpoint 代行の MCP ツールで提供し、ファイル直読み・直書きを採らない」の決定を `docs/adr/` に記録する
- 前提: `provide-operations-via-mcp` の設計確定（記述対象の確定）

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

（なし。ドキュメントのみで挙動は変わらないため `skip_specs: true`）

## Impact

- `docs/specs/`（新規資料）・`docs/specs/core/settings-reference.md`・`docs/adr/`
- アプリのコード・既存 spec への影響なし
