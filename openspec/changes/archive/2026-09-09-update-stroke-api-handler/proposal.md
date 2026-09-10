# update-stroke-api-handler

## Why

ユーザーの決定（2026-09-08）で、**api は REST コール受付のインターフェースであり、handler を持つ**。物差しは capability `server/api-handler`（子 change `update-session-api-handler` が新設）で、`server/api/sessions/**` の 12 本は既にその形になっている。同じ物差しを**エージェントが叩く endpoint（A1・A4・A5・A7・A8）と WS 配信の route（W1・W2）**へ広げるのがこの change である。

いま残っているのは 2 種類ある。

1. **A5（question）と A7（proposal）が実処理を api ファイルの中に持つ。** A7 は 67 行のうち、本文を残す・strokes へマーカー行を追記する・`state.json` を書く・W2 へ配信する・提出を記録する、の 5 段が並ぶ。A5 も 39 行のうち `state.json` の書き込み・W1 配信・提出の記録を持つ。実処理が api に居ると、同じ処理を別の口から呼べず、テストは endpoint を通してしか書けない
2. **W1 / W2 の route が接続時配信の現在分を自分で読み出す。** `readState` して局面を見て、W2 は保存された proposal も読んで `ProposalMessage` を組み立てている。この組み立ては A7 が受理の瞬間に配信するものと同じ形で、**同じ実処理が 2 箇所にある**（capability「同じ実処理を 2 箇所に書かない」）

capability の Requirement は `server/api/` の handler ファイルだけを名指ししており、WS の route（`server/routes/`）は範囲に入っていない。WS を同じ物差しで判定できるようにするため、capability に WS の route の Requirement を 1 つ足す。**新しい capability は作らない。**

親 change は `fix-server-api-layout`。Gitea issue [#18](http://192.168.1.202/gitea/grrowapp/stroke/issues/18) の範囲を 1 本の子 change にしたもの。セッションの endpoint は `update-session-api-handler`（archive 済み）、プロジェクトの endpoint は別の子 change が同じ物差しで行う。

## What Changes

- **追加**: `server/handler/question.ts`（A5 の受理と W1 の接続時配信）・`server/handler/proposal.ts`（A7 の受理と W2 の接続時配信）。受理で書く側と接続時に読む側を 1 ファイルに置き、W2 と A7 で 2 つになっていた `ProposalMessage` の組み立てを 1 つにする
- **変更**: `server/api/strokes/[id]/question/index.post.ts`・`proposal/index.post.ts` を「読む → 局面の述語 → handler を呼ぶ → 返す」の形にする
- **変更**: `server/routes/api/sessions/[id]/ws/question.ts`・`proposal.ts` を「id を読む → 在るかを見る → register → handler が返した現在分を送る」の形にする。配信してよい局面は route が literal で持ち、handler へ集合として渡す
- **追加**: `server/utils/stroke/session-store.ts` に型 `ActiveSessionState`（`isPromotedState` で弾いた残りの形）。api が narrowing した状態を handler の引数の型として書けるようにする
- **変更**: capability `server/api-handler` に Requirement を 1 つ足す——「WS の route は接続の準備と後始末だけを持つ」
- **変更**: テストを寄せ替える。実処理の検査は `test/server/handler/{question,proposal}.test.ts`、api のテストは 400 / 409 / 204 の返し方と handler の呼び出しだけ。W1 / W2 の接続時配信は handler のテストが受け持つ（route には今までテストが無かった）
- **触らない**: A1（overview）・A4（send-back）・A8（submission）。3 本とも「id を解決する → 既存の 1 関数を呼ぶ → 結果を返す」で、capability の「既に薄い endpoint」の Scenario に当たる（design D3 に理由）

**呼び手から見える差は無い。** URL・Method・入出力・status・エラーの本文と `data.reason`・配信の内容と順序・接続時配信の有無は移動の前後で同じである。A7 の順序（残す → phase を進める → W2 配信）は handler が守り、A5 の 400 の文言（`問いの構造として読み取れない。`）も変えない。

- 触らないもの: `docs/specs/api/**`（基準）と docs の全体、`server/api/sessions/**`（済み）、`server/api/projects/**`（別の子 change）、`docs/specs/plan/*`・`docs/adr/*`（当時の記録）
- `server/utils/` の関心単位の切り直しはしない。`session-store.ts` へ足すのは、切り出しに要る型 1 つだけである

## Capabilities

### New Capabilities

なし。物差しは既存の `server/api-handler` を使う。

### Modified Capabilities

- `server/api-handler`: Requirement を 1 つ足す——「WS の route は接続の準備と後始末だけを持つ」。既存の 3 つの Requirement（api の handler ファイルは準備と後始末だけを持つ／局面の述語は api が持ち handler は持たない／同じ実処理を 2 箇所に書かない）は文言を変えない

## Impact

- **コード**: `server/api/strokes/[id]/{question,proposal}/index.post.ts`・`server/routes/api/sessions/[id]/ws/{question,proposal}.ts`・`server/handler/{question,proposal}.ts`（新設）・`server/utils/stroke/session-store.ts`（型 1 つ）
- **テスト**: `test/server/api/strokes/{question,proposal}/index.post.test.ts`（返し方だけに絞る）・`test/server/handler/{question,proposal}.test.ts`（新設。実処理と接続時配信を受け取る）
- **docs**: 変更なし。この change が新しく作る食い違いも無い（design「関連 docs」に確認の結果を書く）
- **openspec**: capability `server/api-handler` に Requirement 1 つを追加
- **外部**: 画面・エージェント・本家（spec-workflow）から見える URL・挙動は変わらない
