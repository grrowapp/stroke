# adr0016-sub-implement-mcp-operations

## Why

`provide-operations-via-mcp` の第一段では、MCP ツールは既存 REST endpoint への代行（薄いプロキシ）に留めて方式を固めた。次の段として実処理化と transport の載せ替えを行う——というのが起票時の想定だった。

**その想定は2つとも前提を失っている。**

- 「自プロセス→自サーバーへの HTTP 往復」は**存在しない**。Nitro の `$fetch` は先頭が `/` のパスを `fetchNodeRequestHandler` へ渡し、ソケットを開かずにハンドラを直接呼ぶ（`nitropack/dist/runtime/internal/app.mjs` の `localFetch`）。外す往復が無い
- transport は**既に** Nitro の Streamable HTTP（route `/mcp`）である。stdio だったことは一度も無い（`provide-operations-via-mcp` の Decision）

残るのは「ハンドラが endpoint を経由せず内部実装を直接呼ぶか」だけで、これは ADR-0014（検証・状態遷移の正は endpoint 側に置き、MCP 層に第2の実装を作らない）と正面から衝突する。

そこで本 change は、**実処理化を採らないことを決めて記録する**ものとする。決めを残さないと、この proposal を読んだ次の担当者が同じ想定で着手する。

## What Changes

- ~~**変更**: ハンドラを実処理へ置き換える~~ → **採らない。** 理由は Why と design.md
- ~~**検討**: transport を stdio から Streamable HTTP へ載せ替える~~ → **済んでいる。** 実装当初から Nitro の route `/mcp`
- **変更**: 代行が暫定ではなく確定した方式であることを `mcp/server` の Requirement として置く。「第一段」「まずは代行で」という書きぶりが残っている限り、次の担当者は続きがあると読む
- **新規**: 判断の根拠（往復が存在しないことの実測・ADR-0014 との衝突）を design.md に残す
- 前提: `provide-operations-via-mcp` の完了（`mcp/server` がメインの spec に入っていること）

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `mcp/server`: 代行を**確定した方式**として定める Requirement を足す。ツールごとの契約（`mcp/tools/*`）は1文字も変わらない。

## Impact

- **コードは変えない。** ハンドラも transport も現状のままとする
- `openspec/specs/mcp/server`（代行が確定した方式であることの Requirement を1件足す）
- 判断の記録として design.md
