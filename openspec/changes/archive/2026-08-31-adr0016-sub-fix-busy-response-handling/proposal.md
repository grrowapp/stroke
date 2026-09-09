## Why

**症状**: 問いに答えると「AI を起動できませんでした。」が出て画面が止まる。同じ問いにもう一度答えるまで先へ進めない。ブラウザで一から通すと毎回起きる。

回答（U7）は受理されている。続けて呼ぶ AI 起動（U13）が、前の claude がまだ走っているために 409 busy を返し、画面がそれを失敗として扱っている。

**409 は仕様どおりの正常な結果である**（`docs/specs/api/contract.md:29-30, 111, 180`）。U7 は実行中でも受理し、多重起動は U13 が 409 で止める、と決めてある。走っている claude が回答を拾って次の問いを出すので、画面は待機に入るのが正しい。

壊れているのは画面側の受け取り方で、3箇所に散っている。

- `app/pages/strokes/[sessionId]/index.vue:118-125` — **今回の発生源**。`catch` が理由を見ずに一律「AI を起動できませんでした。」を出す。409 とそれ以外を区別していない
- `app/composables/useAgentQuestion.ts:117-128` — 409 の分岐は持っているが、待機に入る `startWaiting()` が成功時しか呼ばれない
- `app/composables/useProposalReview.ts:306-317` — 上と同じ形

結果、`strokes.json` に同じ問いへの回答が重複して記録される（実測: 「実行環境」×3・「完了指定」×2・「保存場所」×2）。ユーザーは同じ問いに二度答えることでしか進めない。

## What Changes

- 変更: 前の応答をまだ待っていることが分かったとき、画面はそれを失敗として示さず、待機として示す。ユーザーは同じ問いに答え直す必要がない
- 変更: 待機に入る扱いを、起動を要求できた場合とまだ待っている場合の両方で通す。今は前者だけ
- 変更: 同じ扱いが散っている3箇所を1つに揃える

## Capabilities

### New Capabilities

なし。

### Modified Capabilities

- `agent-question`: 「送れなかった回答は同じ問いのまま送り直せる」に、**前の応答をまだ待っている場合は失敗として示さず待機として示す**ことを加える。同じ問いに二度答えさせない

## Impact

- `app/pages/strokes/[sessionId]/index.vue` — 回答後の起動要求の扱い
- `app/composables/useAgentQuestion.ts` / `app/composables/useProposalReview.ts` — 待機に入る条件
- API・サーバー・依存の変更なし。409 を返す側は正しいので触らない
