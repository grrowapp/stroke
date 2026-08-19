## Why

問いを自由記述で投げ返すだけでは、ユーザーは何を決めればよいか分からず、AI が代わりに決めてしまう。決定をユーザーが下せるよう、問いを選択式で提示し、回答の送り方を定める必要がある。

## What Changes

- 問いの選択式提示と回答の送り方を追加する。

## Capabilities

### Modified Capabilities

- `stroke-session`: 既存 capability に requirement を追加する。

## Impact

`app/components/stroke/QuestionCard.vue`、`server/utils/question.ts`。
