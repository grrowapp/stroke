---
triage:
  - bug
status: Doing
change: fix-steering-empty-completion
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
order: -7.0
---

# fix-steering-empty-completion

steering の実行に `didWork` が無く、1本も文書を書かずに正常終了しても `invocation` は
`idle` になる。巡回は `failed` しか拾わないので、**空振りが成功と区別できず誰も起こし直さない。**

`submit-document`（steering）は本家 REST へ行くため A5・A7 が数える `notifySubmission` に
載らない。steering に `didWork` を持たせるには提出の signal を別に用意する必要がある。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。

対応する change: `fix-steering-empty-completion`
