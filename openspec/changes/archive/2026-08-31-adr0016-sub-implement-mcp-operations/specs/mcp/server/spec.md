# mcp/server Delta

## ADDED Requirements

### Requirement: 代行は確定した方式であり、ツール側に第2の実装を作らない

MCP ツールのハンドラは、対応する endpoint へ要求を発行してその応答だけから結果を作る SHALL。セッション・プロジェクトのファイルを読み書きしてはならない（MUST NOT）。検証・状態遷移をツール側で行ってはならない（MUST NOT。ADR-0014）。

これは**暫定の段ではない**。次の段として実処理へ置き換えることを想定してはならない（MUST NOT）。置き換えの動機とされていた2つは、いずれも成り立たない。

- 「自プロセスへの HTTP 往復を外す」——**往復は存在しない**。Nitro の `$fetch` は先頭が `/` のパスをソケットを開かずにハンドラへ直接渡す（`nitropack` の `localFetch`）
- 「transport を載せ替える」——**既に** Nitro の Streamable HTTP（route `/mcp`）である

#### Scenario: ハンドラが状態を直接触らない

- **WHEN** ツールが対象の状態を必要とする
- **THEN** 対応する endpoint への要求で得ており、ファイルからも内部実装の直接呼び出しからも得ていない

#### Scenario: 同じ検証が2箇所に無い

- **WHEN** 引数が endpoint の受け入れ条件を満たさない
- **THEN** 弾くのは endpoint であり、ツール側は endpoint の応答をそのまま結果に写している
