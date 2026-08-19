## Why

プロジェクト生成は後戻りできない操作なので、ユーザーの明示的な承認以外で起きてはならない。プロジェクト名の確定と承認前の確認、承認後の操作抑止をここで定める必要がある。

## What Changes

- プロジェクト名の確定、承認の確認、承認後の操作抑止を追加する。

## Capabilities

### Modified Capabilities

- `proposal-review`: 既存 capability に requirement を追加する。

## Impact

`app/composables/useProposalReview.ts`、`app/components/review/Modals.vue`。
