---
status: Doing
change: adr0016-sub-fix-upstream-mcp-allowance
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
triage:
  - bug
---

# adr0016-sub-fix-upstream-mcp-allowance

本家 MCP（`mcp__specworkflow`）は `--allowedTools` に載っているのに、案内（`get-steering-guide`）は
「この工程では1つも呼ばない」「`approvals` も呼ぶな」と書いている。**守っているのは案内の散文だけ。**

本家 MCP を起こす目的は起動時の自己登録だけで、ツール呼び出しは1つも要らない。許可から外せば
構造で塞げるが「呼べないものを見せてから失敗させる」形になる。stdio の本家 MCP には
`x-mcp-tools` のような絞りが無く、どちらかを選ぶしかない。

`docs/specs/api/mcp-tools.md` の「操作の入口はこれだけである」と噛み合っていない。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
ADR-0016 の委譲（後続）。

対応する change: `adr0016-sub-fix-upstream-mcp-allowance`
