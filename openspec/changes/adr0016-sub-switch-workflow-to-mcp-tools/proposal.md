# adr0016-sub-switch-workflow-to-mcp-tools

## Why

`provide-operations-via-mcp` で操作系一式は MCP ツールとして提供されるが、ワークフロースキーマの instruction と `--allowedTools` が curl スキルを指したままでは、claude プロセスは従来の入口を使い続け、MCP ツールは使われない。入口を MCP ツールへ切り替えて一本化する。

## What Changes

- **変更**: ワークフロースキーマ `flontier-strokeflow` の instruction を、スキル呼び出し（/get-overview・/question・/proposal・/get-send-back・/get-strokes・/guidance）から MCP ツールの利用指示へ書き換える
- **変更**: 起動定義の `--allowedTools` から curl 系（`Bash(curl -X POST *)`・`Bash(jq -n *)`・`Bash(printenv *)`）を外し、MCP ツールの許可へ置き換える
- **削除**: 代行対象になった curl スキル一式（セッション API スキル5本 + `/guidance` + 本家向け取得スキル3本）を `assets/.claude/skills/` から撤去する
- 前提: `provide-operations-via-mcp` の完了（MCP ツールが提供済みであること）

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `agent/invocation`: 起動定義の許可ツールが curl 前提から MCP ツール前提に変わる。
- `workflow-definition`: セッションワークフロー定義の instruction が指す操作の入口が、スキルから MCP ツールに変わる（コード変更なしで反映される要求自体は維持）。

## Impact

- `~/.local/share/openspec/schemas/flontier-strokeflow/`（配置されるワークフロースキーマの実体。配置手順は README）
- `nuxt.config.ts` の `claude.args`（`--allowedTools`）
- `assets/.claude/skills/` のスキル撤去
- 設定値の変更は `docs/specs/core/settings-reference.md` の改訂を伴う（ADR-0004 の手続き。文書側の作業は `adr0016-sub-document-mcp-operations` と調整）
