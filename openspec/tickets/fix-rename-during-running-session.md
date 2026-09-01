---
tags:
  - bug
status: Tasks
---

# fix-rename-during-running-session

承認によるディレクトリ改名が、走っている flontier の claude を見ていない。busy ガードは
sessionId キー、承認後の steering はプロジェクト名キーで、**同じ物理ディレクトリに対して
2つの claude が同時に走れる**。旧 claude は改名先へ追随して生き続けるが、接続表の文脈が
旧 sessionId のままなので以後のツール呼び出しが全部 `session_not_found` になり、
`invocation` もどこにも残らない。

`yarn check:stroke` は承認の手前で実行の終わりを待って避けているが、実 UI には避ける
仕掛けが無い。

出どころ: change `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。

対応する change: `fix-rename-during-running-session`
