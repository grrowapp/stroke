---
tags:
  - bug
status: Tasks
---

# adr0016-sub-fix-direct-write-allowance

`--allowedTools` の `Write` / `Edit` が、MCP ツールを通さず文書を直接書く経路を残している。

`nuxt.config.ts` のコメントは「`Write` は proposal を `docs/proposal.md` に書くのに要る」と
説明するが、proposal を書くのは受理した A7 である。実測でも直近3実行のいずれも `Write` /
`Edit` を1度も使っていない。**要否を確かめずに残っている。**

`docs/specs/api/mcp-tools.md` の「操作の入口はこれだけである。ファイルの直読み・直書きも、
コマンドによる代行も採らない」を迂回する経路になる。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。
ADR-0016 の委譲（後続）。

対応する change: `adr0016-sub-fix-direct-write-allowance`
