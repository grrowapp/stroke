## Why

差し戻しを受けた AI が確認を返したとき、画面1 へ戻してしまうと、指摘の対象である proposal を見ながら答えられない。画面2 から動かさずに問い返しを受ける経路が要る。

## What Changes

- 画面2 の中で問い返しを1問1答で受ける経路を追加する。

## Capabilities

### Modified Capabilities

- `proposal-review`: 既存 capability に requirement を追加する。

## Impact

`app/components/review/FollowupModal.vue`。
