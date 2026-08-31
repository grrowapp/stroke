# adr0016-sub-create-flontier-guidance-mcp-tool

## Why

flontier 工程（ストロークの往復）には、進め方をエージェントへ渡す手段が無い。

- ワークフロースキーマ `flontier-strokeflow` の instruction は `/get-overview` `/get-strokes` `/get-send-back` というスラッシュコマンド形式で、**指す実体が無い**。エージェントは名前の一致で偶然 MCP ツールに当たっているだけである
- `assets/.claude/skills/guidance/SKILL.md` は中身が旧スキル方式（`STROKE_BASEURL` と `CLAUDE_SESSION_ID` での解決）で MCP に対応しておらず、かつ `--add-dir` を外した以上ロードされない（`provide-operations-via-mcp` tasks 4.9）
- `firstPrompt` / `continuePrompt` から実体の無いスラッシュコマンドの起動を外したので、**案内の入口はいまゼロ本である**

実害は実測で出ている（2026-08-29、セッション `167cb9d2-…` / `d823166d-…`）。差し戻しで「Why が弱い」と指摘された直後、エージェントは proposal の書き方の見本を自力で探し始めた（`.spec-workflow/approvals/…/.snapshots/proposal.md` を `Read`、`find -iname "proposal*.md"`）。手順が届いていれば要らない探索である。

操作系のツールは「何ができるか」しか伝えられない。どの順で何をするか・いつ問いを立てるか・いつ把握完了とみなすか・いつ proposal を出すかは、手順を読まないと決まらない。

## What Changes

- **新規**: flontier 工程の手順を返す MCP ツール `get-guide` を `server/mcp/tools/` に追加する。引数を取らず、`status` と `guide`（手順の本文）を返す
- **変更**: `server/utils/mcp/exposed-tools.ts` の flontier の公開ツール一覧に `get-guide` を足す（steering 工程には見せない。steering 側の案内は `adr0016-sub-create-steering-guidance-mcp-tool`）
- **変更**: `nuxt.config.ts` の `firstPrompt` / `continuePrompt` を、まず `get-guide` を読ませる文言にする。実体の無いスラッシュコマンドを外した後に空いたままの「最初に何をするか」を、実在するツールで埋める
- **範囲外（明示）**:
  - ワークフロースキーマ `flontier-strokeflow` の instruction の書き換えは `adr0016-sub-switch-workflow-to-mcp-tools` の担当。本 change はツールと prompt までを担う
  - steering 工程の案内は `adr0016-sub-create-steering-guidance-mcp-tool`。ツールを分けるのは、工程ごとに公開ツールを絞る仕組み（`x-mcp-tools`）に素直に乗るためである
  - `assets/.claude/skills/guidance/` の撤去は `adr0016-sub-switch-workflow-to-mcp-tools`

## Capabilities

### New Capabilities

- `mcp/tools/guide`: flontier 工程の手順を渡すツールの契約。引数なし・状態非依存の本文・description で最初に呼ぶべきことを述べること。spec は `provide-operations-via-mcp` から移設済み。

### Modified Capabilities

なし。`mcp/server` の「工程で公開ツールを絞る」Requirement の範囲内の追加であり、Requirement 自体は変わらない。

## Impact

- **新規コード**: `server/mcp/tools/get-guide.ts`（手順の本文を持つ唯一のツール）
- **影響コード**: `server/utils/mcp/exposed-tools.ts`（flontier の一覧）、`nuxt.config.ts`（`firstPrompt` / `continuePrompt`）
- **代行先を持たない唯一のツールになる**。他の6本は既存 REST への薄いプロキシで実処理は endpoint 側にあるが（ADR-0014）、手順の本文は endpoint が持っていない。ADR-0014 の「第2の実装を作らない」に反しないのは、**どこにも第1の実装が無いから**である
- **docs**: 触らない。設定（prompt）の改訂は `adr0016-sub-document-mcp-operations` が `docs/specs/core/settings-reference.md` へ反映する
- **前提**: `provide-operations-via-mcp` の完了（ツールの形・公開の絞り・prompt の現状がそこで確定する）
