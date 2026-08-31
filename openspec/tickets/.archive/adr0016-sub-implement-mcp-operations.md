---
tags:
  - enhancement
status: ready-for-agent
order: 0.0
---

# adr0016-sub-implement-mcp-operations

MCP ツールのハンドラを、既存 endpoint への代行から実処理へ置き換える。**MCP 化を完了させる必須の change である。**

触るファイル:
- 更新 server/mcp/tools/（ハンドラ6本の中身。契約＝名前・引数・応答は変えない）
- 更新 server/utils/（実処理の呼び出し先として共有化する範囲）
- 更新 server/utils/mcp/upstream-fetch.ts ほか代行のための層（実処理化で不要になる範囲）

## なぜ必須か

`provide-operations-via-mcp` は**第一段**である。proposal 自身がこう書いている。

> まずは**現行操作の代行**（既存 REST への薄いプロキシ）で方式を固め、MCP ツール自体が実処理を持つ実装は次のステップとする。

代行は方式を固めるための足場であって、到達点ではない。ここで止めると、MCP ツールは「既存 REST への薄い層」のまま残り、自プロセスから自サーバーへ HTTP を投げ続ける。**MCP 化はここまで進めて初めて完了する。**

## 現況（2026-08-29）

`provide-operations-via-mcp` の実装は完了しており、代行方式で実機の往復が通っている（セッション `d823166d-…`: 往復6・proposal 提出・差し戻し → 出し直しまで完走）。置き換えの土台はできている。

**proposal の記述のうち1点は既に達成済みである。** 「transport を stdio から Nitro の Streamable HTTP endpoint へ載せ替えるかを判断し、採る場合は実施する」とあるが、`@nuxtjs/mcp-toolkit` の採用により**最初から route `/mcp`（Streamable HTTP）で提供している**。stdio は一度も使っていない。この項目は落として構わない。

したがって残るのは**ハンドラの実処理化**である。

## 求めるもの

- ハンドラ6本（`get-overview` / `get-strokes` / `get-send-back` / `send-question` / `submit-document` / `get-steering`）の中身を、`$fetch` による endpoint 代行から実処理の直接呼び出しへ置き換える
- **ツールの契約（名前・引数・応答の形）は変えない。** 結果は引き続き1階層のフラット（`status` / 失敗時の `errorCode` と `error`）
- 実処理は `server/utils/` の既存実装と共有する。MCP 層に第2の実装を作らない

## design で詰める論点

代行をやめると、endpoint 経由で通していたものが素通りになる。置き換え先で担保し直す必要がある。

- **busy ガードと前提チェック**。`provide-operations-via-mcp` の design はこう書いている。

  > 同一プロセスでも endpoint を経由するのは busy ガード・前提チェックを通すため（invoke.ts の U13 経由と同じ判断）

  実処理を直接呼ぶなら、このガードをどこに置くかを決める必要がある。

- **入力検証の正をどこに置くか**。ADR-0013 / 0014 は「検証の正は endpoint 側にあり、MCP 層に第2の実装を作らない」としている。実処理化はこの前提を動かすので、ADR の改訂が要るか、検証だけ共有の層へ切り出すかを決める。

  関連: `adr0016-sub-define-request-validation-messages`（違反箇所を送り手へ返す）が同じ層に触る。

- **エラーの形をどう保つか**。いまは endpoint の応答から `status` / `errorCode` / `error` を導いている。実処理化すると HTTP ステータスが無くなるので、契約を保ったまま何から導くかを決める。

## 前提

- `provide-operations-via-mcp` の完了が前提（代行方式で契約が固まっていること）
- `adr0016-sub-switch-workflow-to-mcp-tools` により入口が MCP ツールへ一本化されていることが望ましい
- 契約を変えないので、ツールを呼ぶ側（エージェント・ワークフロースキーマ）への影響は無い
