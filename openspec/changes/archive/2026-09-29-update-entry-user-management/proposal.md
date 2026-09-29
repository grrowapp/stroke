## Why

「ユーザー管理」への入口がプロジェクト一覧の上部にあり、プロジェクトの操作（作成・登録）と並んでいる。ユーザー管理はプロジェクト一覧の操作ではないので、上層の画面を切り替えるタブ bar へ移す。

## What Changes

- プロジェクト一覧の上部から「ユーザー管理」のリンクを外す
- portal のタブ bar の右端に、「通知」「プロジェクト一覧」から離して「ユーザー管理」を置く
- 表示は今と同じく管理者だけ。飛び先は `/admin/users` のまま
- `docs/specs/architecture/screen-flow.md` の入口の記述を直す

## Capabilities

### New Capabilities

### Modified Capabilities

- `access/user-management`: 入口の置き場が、プロジェクト一覧の上部から portal のタブ bar に変わる

## Impact

- 画面: `app/layouts/portal.vue`・`app/pages/projects/index.vue`
- docs: `docs/specs/architecture/screen-flow.md`
- テスト: `test/e2e/access.spec.ts`
