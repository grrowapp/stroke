## 1. 着手

- [x] 1.1 ticket `openspec/tickets/update-entry-user-management.md` の `status` を `Doing` にし、`tags` に `update-entry-user-management/a6786566-d43d-492b-ac94-d8e0cd2468f4` を足す

## 2. 資料

- [x] 2.1 `docs/specs/architecture/screen-flow.md` の入口の記述（遷移の図・操作による遷移・portal layout のタブ）を、タブ bar の右端の「ユーザー管理」に直す

## 3. 実装

- [x] 3.1 `app/pages/projects/index.vue` から「ユーザー管理」のリンクを外す
- [x] 3.2 `app/layouts/portal.vue` のタブ bar の右端に、管理者にだけ「ユーザー管理」を置く

## 4. 検証

- [x] 4.1 `test/e2e/access.spec.ts` を、タブ bar の入口を見る形に直す
- [x] 4.2 `yarn typecheck`・`yarn test`・`yarn test:e2e` が通る（既存の失敗はベースラインと比べる）

## 5. 完了

- [x] 5.1 ユーザーから完了の承認を得て、ticket の `status` を `Wait-for-archive` にする
