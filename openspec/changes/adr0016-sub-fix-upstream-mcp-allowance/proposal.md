## Why

**症状**: 本家 MCP（`mcp__specworkflow`）は `--allowedTools` に載っているが、案内は「この工程では1つも呼ぶな」と書いている。**いま守っているのは案内の散文だけである。**

`server/utils/mcp/allowed-tools.ts` は「配るだけでは一覧に出るのに1つも呼べず、『呼べないものを見せてから失敗させない』を破る」を理由に `mcp__specworkflow` を許可へ足した（`provide-operations-via-mcp` 6.2 の4周目）。一方 `get-steering-guide` は「この工程では1つも呼ばない」「`approvals` も呼ぶな（呼ぶと本家がポーリングを促し、無人実行が打ち切られる）」と書いている。

本家 MCP を起こす目的は**起動時の登録簿への自己登録**だけで、ツール呼び出しは1つも要らない。許可から外せば構造で塞げるが、そうすると「見せてから失敗させる」形になる。stdio の本家 MCP には `x-mcp-tools` のような絞りが無いので、どちらかを選ぶしかない。

`docs/specs/api/mcp-tools.md` は「操作の入口はこれだけである」と定めており、**散文だけが守っている状態はこの規定と噛み合っていない**。

出どころ: `provide-operations-via-mcp` の santa-method レビュー 9周目（2026-08-31）。同 change の範囲外として記録していたが、**範囲外の扱いは不正だった**（ユーザー指摘 2026-09-01）ので change を立てる。ADR-0016 の委譲に「後続」として1本足す。

## What Changes

- 変更: 本家 MCP のツールを呼べる状態と、案内が「呼ぶな」と述べていることの食い違いを解消する。どちらへ倒すかは design で決める（許可から外して構造で塞ぐ / 呼べることを前提に案内を書き直す）
- 変更: 選んだ側を `docs/specs/api/mcp-tools.md` の「操作の入口はこれだけである」と整合させる

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent/invocation`: 本家 MCP をどこまで許可するかを規定に加える
- `mcp/tools/steering-guide`: 案内が述べる禁止が、許可の側と一致していることを規定に加える

## Impact

- `server/utils/mcp/allowed-tools.ts` — 許可の内容
- `server/mcp/tools/get-steering-guide.ts` / `get-guide.ts` — 案内の文言
- `docs/specs/api/mcp-tools.md` — 整合反映（ADR-0004 の手続きに従い design で提案し承認を得る）
