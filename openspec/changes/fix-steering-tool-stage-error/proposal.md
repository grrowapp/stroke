# fix-steering-tool-stage-error

## Why

flontier 工程で `get-steering` を呼ぶと必ず 500 になり、工程外であることが他のツールと同じ契約の形で返らない。

実測 2026-08-28（`yarn check:stroke` のセッション `744aa80a-…`）: エージェントは起動直後に steering 文書3種（product / tech / structure）を順に引き、3回とも `[500] この接続は steering 工程向けではない。` を受け取った。以降は一度も呼んでいない。往復と着地は妨げられていないが、初回に3ターンを無駄にしている。

問題は4つある。

1. **500 が実態と合わない。** サーバーは壊れておらず、「この工程では使えない」と正しく判定できている
2. **他のツールと形が違う。** 他は `{status, errorCode, error}` を返すのに、これだけ生のエラーになる
3. **次に何をすべきか伝えていない。** 引数が悪いのか、工程が違うのか、ツールが壊れているのかが読み取れない
4. **コードが置いている前提が成立していない。** `server/utils/mcp/require-connection.ts` は「呼び出し元ごとに渡すツール定義が分かれる」ためこの状況は起きないとしているが、モジュールは `server/mcp/tools/` を自動発見して単一の `/mcp` で6本すべて配る。`--mcp-config` を工程ごとに分けても、エージェントには全部見えている

根は接続情報の持ち方にある。接続表のエントリが `sessionId`（flontier）か `projectPath`（steering）のどちらかしか持たず、ツール側がその不在を 500 で表している。MCP で完結しているはずの層に、工程の区別が漏れ出している。

## What Changes

- **変更**: 工程外のツールを呼んだときの結果を、他のツールと同じ契約の形（`status` / `errorCode` / `error`）で返す。エージェントが「この工程では使えない」と読み取れるようにする
- **変更**: `require-connection.ts` のコメントが置く前提（工程ごとにツール定義が分かれる）を、実装の事実に合わせて改める

工程ごとにツールを出し分けるか、呼べはするが契約の形で断るかは design で決める。前者はエージェントが無駄な試行をしなくなるが、モジュールの配り方に手が要る。後者は変更が小さいが、呼べてしまう事実は残る。

## Capabilities

### Modified Capabilities

- `mcp/server`: ツールがその接続の工程で使えない場合の結果の形を定める。結果は他のツールと同じ1階層（`status` / `errorCode` / `error`）で、`errorCode` から工程外だと判別できること。

## Impact

- **影響コード**: `server/utils/mcp/require-connection.ts`、`server/mcp/tools/get-steering.ts` / `submit-document.ts`（steering 種別）
- **影響しないもの**: flontier 工程の往復と着地。現状でも妨げられていない
- **優先度**: クリティカルではない（ユーザー判断 2026-08-28）

## 未確認

`get-steering` の**成功経路**は一度も通っていない。承認して steering 工程へ入れば通る可能性があり、そこは `add-stroke-check-approval-option` で確認できるようになる。直し方を決める前に、成功経路の実態を見ておく価値がある。
