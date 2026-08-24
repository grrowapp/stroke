## 1. 資料を書く

配置を動かす前に、規則を先に書き出す。動かしてから書くと、規則ではなく結果の記録になる。

- [x] 1.1 `docs/structure.md` を書く。領域名（`stroke`）と、Nuxt の各ディレクトリでの名前空間の取り方
- [x] 1.2 URL の規則を書く。`/` を持たないこと、`/api/` 直下に動的セグメントを置かないこと
- [x] 1.3 領域に属さないもの（`app/app.vue` / `main.css` / `nuxt.config.ts` / `package.json` / `tsconfig.json` / `server/plugins/`）を明記する
- [x] 1.4 `CLAUDE.md` の Docs 一覧に `docs/structure.md` を足す
- [x] 1.5 現状の棚卸しを残す（`docs/file-composables.md` / `docs/file-components.md`）。**規則ではない**と明記する

## 2. 席を明け渡す

統合したときに相手と奪い合うものだけを動かす。**内部の切り直しはしない。**

- [x] 2.1 `shared/types.ts` → `shared/stroke.ts`。参照元 23 ファイルの `#shared/types` を追随させる
- [x] 2.2 `app/pages/index.vue` → `app/pages/strokes/index.vue`
- [x] 2.3 `app/pages/s/[sessionId]/` 2本 → `app/pages/strokes/[sessionId]/`
- [x] 2.4 `server/api/overview.post.ts` → `server/api/strokes/index.post.ts`
- [x] 2.5 `server/api/sessions.get.ts` → `server/api/strokes/index.get.ts`
- [x] 2.6 `server/api/[id]/` 11本 → `server/api/strokes/[id]/`
- [x] 2.7 `server/routes/api/[id]/ws/` 2本 → `server/routes/api/strokes/[id]/ws/`
- [x] 2.8 **WS の URL からセッション id を抜く正規表現を追随させる。** `sessionIdFromUrl()` の `/\/api\/([^/]+)\/ws\/…/` に `strokes` を挟む。**型では守られない**
- [x] 2.9 `server/utils/` 18本を `server/utils/stroke/` の下へ移す。**中は平置きのまま**、区分は作らない
- [x] 2.10 import パスを追随させる。`nuxt.config.ts` が `api-base-url.ts` を、`scripts/session.ts` が `session-core.ts` を参照している点を落とさない
- [x] 2.11 画面から呼ぶ endpoint・WS・画面遷移先を新しいパスに追随させる
- [x] 2.12 `app/assets/css/main.css` から領域固有のもの（`.blink` とそのモーション抑制）を分ける
- [x] 2.13 `/` と `/api/` 直下に何も残っていないことを確かめる

`app/app.vue` は動かさない。中身が `<UApp><NuxtPage /></UApp>` だけで領域固有のものを持たず、マージ先の app.vue にも同じものが揃っている。統合時はあちらを採れば済む。

## 3. 領域の外へ出ているものを追随させる

- [x] 3.1 `assets/.claude/skills/` の curl URL を新しいパスにする（`get-overview` / `get-strokes` / `get-send-back` / `question` / `proposal` の5本）
- [x] 3.2 `docs/api-contract.md` を新しいパスに更新する
- [x] 3.3 `docs/session-workflow.md` の配線の記述を更新する
- [x] 3.4 `README.md` の画面の表（`/` `/s/<uuid>`）を更新する

## 4. 確かめる

- [x] 4.1 `yarn typecheck` が通る — exit=0、TS エラー0件（`yarn install` が未実施だったので先に実行した）
- [x] 4.2 dev サーバーを起動し、ルーティングと WS を確かめた。**AI の呼び出しは行っていない**（既存セッションへの接続で足りたため）
  - `GET /` → 404（席が空いた）、`GET /strokes` → 200、`GET /api/strokes` → 200、`GET /api/sessions` → 404（旧パスが消えた）
  - **WS（2.8 の正規表現）**: 実在 id では question / proposal とも接続が保たれ接続時配信も届く。不在 id では即 close。**区別がついたので URL から id を抜けている**（正規表現が合っていなければ実在 id でも即 close になる）
- [x] 4.3 `yarn session list` が動く（`server/utils/stroke/session-core.ts` の import が解決している）。`create` / `delete` は既存セッションを壊さないよう実行していない
- [x] 4.4 `openspec validate --all` — `design-semantic-structure` は通過。失敗2件は別 change の specs 未着手で既知

## 5. 成果物を git に入れる

- [x] 5.1 commit する（`a7a29f6`）。地図と ADR（`plan-mainline-merge` の成果）も未コミットのままだったので同じ commit に含めた
