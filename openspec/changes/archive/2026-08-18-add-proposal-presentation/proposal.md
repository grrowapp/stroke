## Why

把握完了で AI が proposal を起こしても、読める形で画面に出なければ、承認すべきか差し戻すべきかをユーザーが判断できない。proposal を描画し、読み方を選べるようにする必要がある。

## What Changes

- proposal の描画と見せ方の切り替えを追加する。

## Capabilities

### New Capabilities

- `proposal-review`: この change で新設する。

## Impact

`app/pages/s/[sessionId]/proposal.vue`。
