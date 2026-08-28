---
status: needs-triage
tags:
  - bug
---

# fix-steering-tool-stage-error

flontier 工程で `get-steering` を呼ぶと必ず 500 になる。工程外であることを、他のツールと同じ契約の形で返していない。

## 事実

実測（`yarn check:stroke` で流したセッション `744aa80a-…`、2026-08-28）:

```
tool_use の並び（先頭から）
  1 ToolSearch
  2 get-overview
  3 get-send-back
  4 get-strokes
  5 get-steering  {"name":"product"}    -> [500] この接続は steering 工程向けではない。
  6 get-steering  {"name":"tech"}       -> [500] 同上
  7 get-steering  {"name":"structure"}  -> [500] 同上
  8 send-question ...
```

エージェントは起動直後に steering 文書3種を順に引き、3回とも失敗したあとは一度も呼んでいない。往復と着地は妨げられていない。

投げているのは `server/utils/mcp/require-connection.ts`:

```
throw createError({
  statusCode: 500,
  statusMessage: 'Internal Server Error',
  message: 'この接続は steering 工程向けではない。',
})
```

## 問題

1. **500 が実態と合わない。** サーバーは壊れておらず、「この工程では使えない」と正しく判定できている
2. **他のツールと形が違う。** 他は `{status, errorCode, error}` で返るのに、これだけ生のエラーになる。エージェントが同じ扱いをできない
3. **次に何をすべきか伝えていない。** 引数が悪いのか、工程が違うのか、ツールが壊れているのかが読み取れない
4. **コードのコメントが置く前提が成立していない。**

```
steering 工程の接続で flontier 向けツールが呼ばれることは normal フローでは起きない
（呼び出し元ごとに渡すツール定義が分かれる）
```

分かれていない。モジュールが `server/mcp/tools/` を自動発見して単一の `/mcp` で6本すべて配るため、`--mcp-config` を工程ごとに分けても、エージェントには全部見えている。

## 根

接続表のエントリが `sessionId`（flontier）か `projectPath`（steering）のどちらかしか持たず、ツール側がその不在を 500 で表している。MCP で完結しているはずの層に、工程の区別が漏れ出している。

## 影響度

**クリティカルではない。** 往復も着地も妨げない。初回に3ターン無駄になるだけ（ユーザー判断 2026-08-28）。

## 方針の候補

- 工程ごとにツールを出し分ける（呼べないものを見せない）
- 工程外である旨を契約の形（`status` / `errorCode`）で返す
- 接続情報の持ち方を変え、工程の区別をツールから追い出す

## 未確認

`get-steering` の**成功経路**は一度も通っていない。承認して steering 工程へ入れば通る可能性がある（`add-stroke-check-approval-option` で確認できるようになる）。
