---
tags:
  - bug
status: Tasks
---

# fix-orphan-run-on-restart

実行の途中で dev サーバーが再起動すると、走っていた claude が孤児として生き残る。接続表も
busy ガードもメモリなので再起動で空になり、巡回の初回掃除が `running` を `failed` へ倒した
あと、次の巡回が U13 を通してしまう。**同じ会話 id に2つ目の claude が立つ。** 孤児が終わると
A8 で `invocation` を書き、新しい実行の記録を上書きする。

接続表を永続化しない決定の裏側で、再起動をまたいだ実行の後始末が無い。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。

対応する change: `fix-orphan-run-on-restart`
