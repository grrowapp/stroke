## 1. 調査

- [x] 1.1 prototype を実ブラウザで開き、下層ヘッダーの computed 値を実測する（結果は proposal.md - Findings）
- [x] 1.2 実測を受けて proposal.md / design.md の前提を書き直す

## 2. 決定

- [x] 2.1 prototype から外れてヘッダー内に階層を作ると決める。値は実機で 24px / 22px を見たうえで 20px / 16px に確定

## 3. 様式

- [x] 3.1 `app/assets/css/main.css` の prototype 由来の `@layer components` に `.sb-bar-back`（16px）と `.sb-bar-title`（20px / 600）を足す。`.sb-navitem` の 13px を上書きするため `.sb-navitem` より後に置き、prototype から外れる理由をコメントに書く
- [x] 3.2 `app/layouts/workspace.vue` の戻る導線に `sb-bar-back`、プロジェクト名に `sb-bar-title` を当て、重複する `font-semibold` を外す

## 4. テスト

- [x] 4.1 `e2e/design-token.spec.ts` に下層ヘッダーの文字サイズを固定するテストを足す。値そのものと「主題 > 戻る導線」の関係の両方を確認し、状態チップが prototype のまま 11px であることも押さえる
- [x] 4.2 `yarn build` してから `yarn test` と `yarn test:e2e` を通す（E2E は `.output` を使うのでビルドが要る）
