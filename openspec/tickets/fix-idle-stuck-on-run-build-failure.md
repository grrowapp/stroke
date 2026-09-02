---
status: Doing
tags:
  - proposal
  - specs
  - design
  - tasks
  - provide-operations-via-mcp/1efe8b7b-f95c-4774-bebe-0498f673be5f
triage:
  - bug
change: fix-idle-stuck-on-run-build-failure
order: -6.0
---

# fix-idle-stuck-on-run-build-failure

`buildRun` が同期 throw すると、`kick` は token を消して reject を返すが **`invocation` を
誰も `failed` にしない**。U13 は 200 を返すので呼び出し側の `.catch` も走らず、巡回は
`failed` しか拾わない。**設定が読めない限りセッションは永久に `idle` のまま止まり、
サーバーログ1行しか残らない。**

`mcpConfigFor` が `readServerConfig()` を読むようになったことで、この経路に入る条件が
1つ増えている。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。

対応する change: `fix-idle-stuck-on-run-build-failure`
