# adr0016-sub-switch-workflow-to-mcp-tools

## Why

`provide-operations-via-mcp` で操作系一式は MCP ツールとして提供されるが、ワークフロースキーマの instruction と `--allowedTools` が curl スキルを指したままでは、claude プロセスは従来の入口を使い続け、MCP ツールは使われない。入口を MCP ツールへ切り替えて一本化する。

## What Changes

- **変更**: ワークフロースキーマ `flontier-strokeflow` の instruction を、スキル呼び出し（`/get-overview`・`/question`・`/proposal`・`/get-send-back`・`/get-strokes`・`/guidance`・`/domain-modeling`）から MCP ツールの利用指示へ書き換える。**手順そのものは書かず、案内のツール（`get-guide`）を指す**——同じ手順が2箇所にあると片方だけが古くなる
- ~~**変更**: 起動定義の `--allowedTools` から curl 系を外し、MCP ツールの許可へ置き換える~~ → **`provide-operations-via-mcp` で済んだ**（2026-08-30。現在の値は `Skill Bash(openspec *) Read Edit Write` ＋ 呼び出しごとの `mcp__stroke-board`）。本 change ではやることが無い
- **変更**: `openspec/specs/agent/invocation` の2つの Requirement を実装へ揃える。**`provide-operations-via-mcp` が作った食い違いで、同 change が範囲外として送ったもの**である
  - 「AI は実際のスキルとして走る」（`grilling` / `domain-modeling` がロードされる前提）——`--add-dir` を外した以上ロードされない。MCP ツールで手順を受け取る形の Requirement へ入れ替える
  - 「起動設定は再ビルドなしで変更できる」の既定値に `--add-dir` が挙がっている——外したので落とし、`--strict-mcp-config` を足す
- **削除**: 代行対象になった curl スキル一式を `assets/.claude/skills/` から撤去する（`get-overview` / `get-strokes` / `get-send-back` / `question` / `proposal` / `guidance` / `get-product` / `get-tech` / `get-structure` の9本。`template/` は残す——proposal と steering の雛形として中身がまだ使われる）
- 前提: `provide-operations-via-mcp` の完了（MCP ツールが提供済みであること）

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `agent/invocation`: 「スキルとしてロードされた状態で走る」前提を、「手順を MCP ツールから受け取って走る」へ入れ替える。起動フラグの既定値から `--add-dir` を落とし `--strict-mcp-config` を足す。
- `workflow-definition`: セッションワークフロー定義の instruction が指す操作の入口が、スキルから MCP ツールに変わる（コード変更なしで反映される要求自体は維持）。

## Impact

- `~/.local/share/openspec/schemas/flontier-strokeflow/`（配置されるワークフロースキーマの実体。配置手順は README）
- `nuxt.config.ts` の `claude.args`（`--allowedTools`）
- `assets/.claude/skills/` のスキル撤去
- 設定値の変更は `docs/specs/core/settings-reference.md` の改訂を伴う（ADR-0004 の手続き。文書側の作業は `adr0016-sub-document-mcp-operations` と調整）
