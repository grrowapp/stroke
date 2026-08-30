# replace-polling-with-push

ストローク側の待機を、3秒ポーリングから WS の push に寄せる。**`useWaitingRetry` のポーリングを無くすことを前提に置く。**

## 起票の根拠（2026-08-25 実測）

`app/composables/useWaitingRetry.ts` の冒頭コメントは、ポーリングを「保険」と位置づけている。

> 通常は W1 / W2 の配信が先に届いて呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険（design.md 決定6）

**この位置づけは成功パスしか見ていない。** サーバーが WS へ publish するのは2箇所しかない。

| 送信元 | チャンネル | 送るもの |
| --- | --- | --- |
| `server/api/strokes/[id]/question.post.ts:31` | W1 | AI が提出した新しい問い |
| `server/api/strokes/[id]/proposal.post.ts:36` | W2 | AI が提出した proposal |

**失敗のときは何も送られない。** `server/utils/stroke/ai.ts` の `setInvocation('failed')`（99・126・140行）は `state.json` を書くだけで publish しない。

したがって:

- 成功の決着 — W1 / W2 の push が先に届く。ポーリングは3秒後に同じ結論へ達するだけで、実質使われない
- **失敗の決着 — WS に経路が無く、3秒ポーリングが唯一の検出手段**

失敗は保険ではなく本体。「保険」という記述が現状と合っていない。

## 決定（2026-08-29）

**失敗も push する。ポーリングは廃止する。**

WS が push なのは、サーバーだけが AI の提出の瞬間を知っていて、ブラウザにそれを察する手段が無いからである。失敗の瞬間も同じくサーバーしか知らない。**成功だけ push して失敗を送らない理由が無い。**

- publish は `server/api/strokes/[id]/submission.post.ts`（A8）に足す。`invocation` の唯一の書き込み口で、失敗は4経路とも必ずここを通る
- 送るのは `invocation` の値。画面は届いた1件で決着を判定する
- 流す先は W1・W2 の両方
- 切断中の分は接続時配信で拾う。`ws/question.ts` / `ws/proposal.ts` は既に `readState()` を呼んでいる
- `useWaitingRetry` の3秒ポーリングを外す

## 併せて出ている事実

- AI の実行中、ポーリングは3秒ごとに `GET /api/strokes/<id>` を叩き続けるが、`invocation: 'running'` の間は何もしない
- `useWaitingRetry` は共有 composable ではない。**画面2 にはインスタンスが2つある**（`useProposalReview.ts:86` の自前と、`useAgentQuestion.ts:53` の中）。待機が重なれば毎3秒で2回叩く
- `useProposalReview.ts` の `pendingAction` は型が `'send-back' | null` で、`'send-back'` 以外を取らない（89・294行）。分岐先が1つしかない

## 関連

- `separate-composable-responsibilities` の ticket にある「差し戻しと問い返しの2種類の送信が同じ待機機構を**共有**していて、決着時にどちらの後始末をするかを `pendingAction` で分岐している」は**現状と合っていない**。`replace-handrolled-with-libraries` の AgentQuestion 再編で問い返しが `useAgentQuestion` 側へ移り、共有は解消済み。あちらの ticket も実測に合わせて直す必要がある
- `docs/specs/architecture/session-workflow.md` / `question-flow.md` に待機と失敗の扱いが書かれている場合、追随が要る
