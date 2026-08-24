## Why

積んだ指摘を1本のテキストに畳んで渡すと、どの指摘が本文のどこを指すのかが失われる。同じ内容を複数の形で同時に渡し、対応方法は指示せずに proposal を出し直させる必要がある。

## What Changes

- 4層の差し戻しペイロードと出し直しの反映を追加する。

## Capabilities

### Modified Capabilities

- `proposal-review`: 既存 capability に requirement を追加する。

## Impact

`server/api/sessions/[id]/send-back.post.ts`、`useAnnotations.buildPayload()`。
