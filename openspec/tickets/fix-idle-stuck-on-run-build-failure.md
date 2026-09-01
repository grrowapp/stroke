---
tags:
  - bug
status: Tasks
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
