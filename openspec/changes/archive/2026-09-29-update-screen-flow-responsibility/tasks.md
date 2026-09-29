## 1. 着手の記録と承認

- [x] 1.1 `openspec/tickets/update-screen-flow-responsibility.md` の `status` を `Doing` にし、`tags` に `<ブランチ名>/<セッション ID>` を追記する
- [x] 1.2 design.md の D4（通知の移設先 `/notifications`）を挙動の差でユーザーへ示し、承認を得る。承認が得られるまで 3 章に着手しない
- [x] 1.3 design.md の D6（上位資料3ファイルへの整合反映）をユーザーへ示し、承認を得る。承認が得られるまで 6 章に着手しない

## 2. 画面実体を Page Component へ切り出す

- [x] 2.1 `app/components/page/Stroke/Start/Container.vue` を作り、現 `app/pages/strokes/index.vue` の中身（概要入力・起動失敗時の選択肢・破棄の承諾）をそのまま移す
- [x] 2.2 `app/pages/strokes/index.vue` を、`definePageMeta({ layout: 'stroke' })` と Page Component の呼び出しだけの薄い route にする
- [x] 2.3 `/strokes` の見た目と挙動が切り出し前と変わらないことを確かめる（概要投稿・起動失敗の3択・破棄の承諾）
- [x] 2.4 `app/components/page/` が初めてできるので、`docs/specs/structure/system-structure.md` のディレクトリツリーへ反映する（D6 の承認の範囲内）

## 3. 通知を `/notifications` へ移す

- [x] 3.1 `/notifications` の route を作り、現 `app/pages/index.vue` の通知の実装を移す（`portal` layout のまま）
- [x] 3.2 `app/layouts/portal.vue` の通知タブの飛び先を `/` から `/notifications` に変える
- [x] 3.3 `/` への導線を `app/layouts/portal.vue` に足さない。概要入力へ行く導線はプロジェクト一覧の作成ボタン → `/strokes` で足り、`/strokes` と `/` は同じ中身を出すため
- [x] 3.4 下層のヘッダー左「ポータルへ戻る」の飛び先を `/` から `/projects` に変える（ユーザー承認済み。`/` が概要入力になり、押した先が閉じる操作の無い全面モーダルになるため）

## 4. `/` を stroke 初期画面にする

- [x] 4.1 `app/pages/index.vue` を、`definePageMeta({ layout: 'stroke' })` と `app/components/page/Stroke/Start/Container.vue` の呼び出しだけの薄い route に置き換える
- [x] 4.2 3 章と 4 章を1つのコミットにまとめる（間で止めると `/` が通知のまま通知が2箇所に出る）
- [x] 4.3 `nuxt.config.ts` に `routeRules` の `redirect` が無いこと、`app/middleware/` に遷移を起こすものが無いことを確かめる
- [x] 4.4 `app/pages/projects/index.vue` の作成ボタンの飛び先が `/strokes` のままであることを確かめる（`/` へ向けない）

## 5. テスト

- [x] 5.1 `/` を開き、待っても URL が `/` のままで `/projects` へ移らないことを確かめる E2E を足す
- [x] 5.2 `/` を再読み込みしても `/` のままで stroke 初期画面が出ることを確かめる E2E を足す
- [x] 5.3 `/` と `/strokes` が同じ中身を出すことを確かめる E2E を足す
- [x] 5.4 プロジェクト一覧の「作成」を押すと `/strokes` になり、`/` にはならないことを確かめる E2E を足す
- [x] 5.5 通知の URL に依存していた既存の E2E を `/notifications` に合わせる
- [x] 5.6 `yarn test` と `yarn test:e2e` を通す

## 6. 資料の反映

- [x] 6.1 `docs/specs/architecture/screen-flow.md` を新規に書く。上層の URL 一覧・各画面の責務・遷移の図（mermaid）・自動遷移を持たない旨・`/` とストローク開始 path が同じ画面を出す理由を含める
- [x] 6.2 `docs/specs/plan/portal-stroke-entrance.md` の入口の記述のうち screen-flow と重なる部分を畳み、URL と責務の正は `screen-flow.md` を指すように参照を張り直す
- [x] 6.3 `docs/adr/0009-create-enters-stroke-overview.md` の状態行の引き継ぎ先（`portal-stroke-entrance.md` の節）が 6.2 の後も成立しているか確かめ、ずれていれば状態行を直す
- [x] 6.4 `docs/adr/0025-no-unilateral-navigation-changes.md` が指す `docs/specs/architecture/screen-flow.md` が実在することを確かめる

## 7. 検証と完了

- [x] 7.1 `openspec validate --all --store stroke` を通す
- [x] 7.2 `yarn dev` で起動し、`/` → 概要入力が出ること、`/projects` → 一覧が出ること、作成ボタン → `/strokes` に移ること、`/notifications` → 通知が出ることをブラウザで確かめる。確認後は dev サーバーを停止し、ポートの解放を確かめる
- [x] 7.3 ユーザーへ完了承認を求め、得られたら ticket の `status` を `Wait-for-archive` にする
