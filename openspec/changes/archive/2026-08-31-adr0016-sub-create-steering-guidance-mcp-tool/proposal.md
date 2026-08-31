# adr0016-sub-create-steering-guidance-mcp-tool

## Why

steering 工程（承認で昇格したプロジェクトで product / tech / structure を作る工程。ADR-0011）には、進め方をエージェントへ渡す手段が無い。

`steeringPrompt` は `/write-steering-v2` を指していたが、**このスキルはどこにも存在しない**（`.claude/skills/` にも `assets/.claude/skills/` にも無い）。prompt の先頭に置くと `Unknown command` になり、起動が assistant のターンをひとつも持たずに終わる。**steering 工程が空振りしていた直接の原因**で、`provide-operations-via-mcp` がその起動を外した（実測 2026-08-30）。

外したことで工程は動き出せるようになったが、**案内はゼロ本のままである**。旧経路の `get-product` / `get-tech` / `get-structure` スキルは `assets/.claude/skills/` に在るものの、`--add-dir` を外した以上ロードされない。

flontier 側と同じく、操作系のツール（`get-steering` / `submit-document`）は「何ができるか」しか伝えられない。3文書をどの順で作るか・既に在る文書をどう扱うか・どこで終わりとみなすかは、手順を読まないと決まらない。

## What Changes

- **新規**: steering 工程の手順を返す MCP ツール `get-steering-guide` を `server/mcp/tools/` に追加する。引数を取らず、`status` と `guide`（手順の本文）を返す
- **変更**: `server/utils/mcp/exposed-tools.ts` の steering の公開ツール一覧に `get-steering-guide` を足す（flontier 工程には見せない）
- **変更**: `nuxt.config.ts` の `steeringPrompt` を、まず `get-steering-guide` を読ませる文言にする
- **範囲外（明示）**:
  - flontier 工程の案内は `adr0016-sub-create-flontier-guidance-mcp-tool`。ツールを分けるのは、工程ごとに公開ツールを絞る仕組み（`x-mcp-tools`）に素直に乗るためである
  - `assets/.claude/skills/` の旧スキル撤去は `adr0016-sub-switch-workflow-to-mcp-tools`
  - 承認依頼の作成（本家 MCP ツール `approvals`）は steering 工程が本家 MCP を併用したままで、手順はその使い方に触れるが仕組みは変えない

## Capabilities

### New Capabilities

- `mcp/tools/steering-guide`: steering 工程の手順を渡すツールの契約。引数なし・状態非依存の本文・description で最初に呼ぶべきことを述べること。

### Modified Capabilities

なし。`mcp/server` の「工程で公開ツールを絞る」Requirement の範囲内の追加である。

## Impact

- **新規コード**: `server/mcp/tools/get-steering-guide.ts`
- **影響コード**: `server/utils/mcp/exposed-tools.ts`（steering の一覧）、`nuxt.config.ts`（`steeringPrompt`）
- **docs**: 触らない。`steeringPrompt` の改訂は `adr0016-sub-document-mcp-operations` が `docs/specs/core/settings-reference.md` へ反映する。**その資料はいまも `/write-steering-v2` を現行仕様として載せている**ので、反映は急ぐ
- **前提**: `provide-operations-via-mcp` の完了。検証は `adr0016-sub-add-stroke-check-approval-option` の完了を待つ（`yarn check:stroke` が proposal で止まる限り承認後の工程へ入れない）
