---
status: Wait-for-archive
change: update-entry-user-management
origin: user
tags:
  - proposal
  - specs
  - tasks
  - update-entry-user-management/a6786566-d43d-492b-ac94-d8e0cd2468f4
---

# update-entry-user-management

「ユーザー管理」への入口を、プロジェクト一覧の上部から portal のタブ bar へ移す。

## 事実

起票時点で分かっていること。

- 入口は今、`app/pages/projects/index.vue` の上部（作成ボタンの左）に管理者にだけ出ている（change add-access-control-project）
- portal のタブ bar は `app/layouts/portal.vue` にあり、「通知」「プロジェクト一覧」の2つを持つ
- 入口の規定は `openspec/specs/access/user-management`「プロジェクト一覧に管理者にだけ入口を出す」、遷移の正は `docs/specs/architecture/screen-flow.md`

## ユーザーが確定させたこと

- 入口をプロジェクト一覧に出すのをやめる
- タブ bar の左に「通知」「プロジェクト一覧」、右端に離して「ユーザー管理」を置く
- 表示は管理者だけ。飛び先は `/admin/users` のまま
