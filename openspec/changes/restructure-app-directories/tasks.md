# Tasks — restructure-app-directories

この change は実装後に起票した後付けである。以下はすべて完了済み。

## 1. 現状把握

- [x] 1.1 `layouts/` と `pages/` の階層の区切りを確認する（上層 `portal` 2ページ / 下層 `workspace` 10ページ）
- [x] 1.2 全コンポーネント・全 composable の参照元を grep で洗い出し、階層ごとに集計する
- [x] 1.3 `nuxt.config.ts` の auto-import 設定を確認し、ディレクトリ移動が Nuxt の名前解決に影響しないことを確かめる
- [x] 1.4 auto-import に依存した参照（明示 import の無い利用）が1件も無いことを確かめる
- [x] 1.5 移動前のベースラインを取る（`yarn test` 106 passed / `yarn test:e2e` 129 passed）

## 2. ディレクトリの移動

- [x] 2.1 `app/components/shared/`、`app/composables/shared/`、`app/composables/workspace/` を作る
- [x] 2.2 `components/ui/SbIcon.vue` を `components/shared/` へ `git mv` する
- [x] 2.3 `components/ui/UpstreamIcon.vue` を `components/shared/` へ `mv` する（untracked のため）
- [x] 2.4 `components/notification/NotificationToaster.vue` を `components/shared/` へ `git mv` する
- [x] 2.5 `composables/useBoardSocket.ts`、`useRelativeTime.ts` を `composables/shared/` へ `git mv` する
- [x] 2.6 `composables/useProjectApi.ts`、`useSteeringDocuments.ts` を `composables/workspace/` へ `git mv` する
- [x] 2.7 空になった `components/ui/` と `components/notification/` を削除する
- [x] 2.8 `components/workspace/` は移動しない（実測で下層専用と確認済み）
- [x] 2.9 `components/portal/` は作らない（上層専用コンポーネントが実在しないため）

## 3. import パスの書き換え

- [x] 3.1 7つの旧パスを新パスへ一括置換する（19ファイル / 56行）
- [x] 3.2 旧パスの残骸が0件であることを grep で確認する
- [x] 3.3 参照先ごとの件数内訳が移動前と完全一致することを確認する
- [x] 3.4 モジュールの中身を1行も変更していないことを確認する

## 4. 検証

- [x] 4.1 `yarn typecheck` が exit 0 で通る
- [x] 4.2 `yarn test` が 106 passed でベースラインと同値
- [x] 4.3 `yarn test:e2e` が 129 passed でベースラインと同値
- [x] 4.4 `git status` で6件がリネームとして追跡されていることを確認する

## 5. 起票

- [x] 5.1 この change を後付けで起票し、proposal / spec / design / tasks を書く
