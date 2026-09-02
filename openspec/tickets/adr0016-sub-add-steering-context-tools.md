---
status: Planning
change: adr0016-sub-add-steering-context-tools
tags:
  - proposal
triage:
  - bug
---

# adr0016-sub-add-steering-context-tools

steering 工程に文脈を取る MCP ツールが無く、claude が毎回ファイルを直接読んでいる。

実測 2026-09-01（`yarn check:stroke --approve` 2周、`debugLogDir` を一時設定して計測）:
steering の実行は 2周とも `Read` 5回・`Bash` 1〜2回で `/opt/projects/<project>` の
`overview.txt` / `docs/proposal.md` / `state.json` / `strokes.json` / `openspec/config.yaml`
を直接読み、`.spec-workflow` と `openspec` を `find` していた。flontier 側は `Read` も
`Bash` も 0回である（`get-overview` / `get-strokes` があるため）。

`adr0016-sub-fix-direct-write-allowance` が `Write` / `Edit` を外して書き込み側は構造で
閉じたが、**読み取り側は開いたまま**。`docs/specs/api/mcp-tools.md` の「操作の入口は
これだけである。ファイルの直読み・直書きも採らない」と、`get-steering-guide` の
「ファイルを直接読み書きしない」の両方が守られていない。

`Read` を単に外すと steering が成立しない。**道具を先に用意してから閉じる。**

出どころ: change 群の実機検証（2026-09-01）。ADR-0016 の委譲（後続）。

対応する change: `adr0016-sub-add-steering-context-tools`
