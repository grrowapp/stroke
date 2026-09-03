## 1. 移す

- [x] 1.1 `openspec/tickets/fold-stroke-css.md` の `status` へ `Doing` と書く（`docs/agents/ticket-tracker.md`）
- [x] 1.2 `app/assets/css/main.css` のストロークの区画（`@layer components` のブロック、
      `.sb-stroke-card` の後ろ）へ `@keyframes sb-stroke-blink` と `.sb-stroke-blink` を置く。
      値は `stroke.css` の現物と同じ（`1.1s ease-in-out infinite` / `50% { opacity: 0.35 }`）——
      `main.css:1325-1337`。値は現物のまま
- [x] 1.3 同じブロックへ `@media (prefers-reduced-motion: reduce) { .sb-stroke-blink { animation: none } }`
      を置く（design 決定1）——`main.css:1340-1344`
- [x] 1.4 移した定義へコメントを添える — 何を示すための明滅か（待機と、AI からの問い返し）、
      そして下層の `sb-loader-blink` と値が違うのはなぜか（design 決定3）——`main.css:1311-1324`

## 2. 呼び先を改名に追従させる

- [x] 2.1 `app/components/WaitingIndicator.vue` の `blink` → `sb-stroke-blink`
- [x] 2.2 `app/pages/strokes/[sessionId]/proposal.vue` の問い返しの帯の `blink` → `sb-stroke-blink`
- [x] 2.3 repo 全体を `blink` で検索し、`sb-stroke-blink` と `sb-loader-blink` 以外の
      ヒットが 0 件であることを確認する（design のリスク欄）——`app/ modules/ shared/ server/ test/ docs/ nuxt.config.ts`
      を検索。残るヒットは `sb-stroke-blink`（`main.css` 5件・`.vue` 2件）と
      `sb-loader-blink`（`main.css` 4件）のみ。素の `blink` は 0 件

## 3. 外す

- [x] 3.1 `nuxt.config.ts` の `css` を `['~/assets/css/main.css']` にし、脇のコメントを
      実態へ書き換える（design 決定4）
- [x] 3.2 `app/assets/css/stroke.css` を削除する——`git rm`。`app/assets/css/` は `main.css` の1本
- [x] 3.3 `app/assets/css/main.css` 3 行目のコメントから `stroke.css` の名指しを外す（design 決定5）

## 4. 文書を合わせる

- [x] 4.1 `docs/specs/core/file-components.md` の `WaitingIndicator` の説明にある
      `.blink` を新しい名前へ
- [x] 4.2 `docs/specs/plan/structure-migration.md` から `assets/css/stroke.css` の行を落とす。
      表が空になるなら節ごとの扱いも確認する——行を削除した（ticket の「該当行を消す」どおり）。
      表には未解消の差が残るので空にはならない

## 5. 確かめる

- [x] 5.1 `yarn typecheck` が通る——通過
- [x] 5.2 `yarn test` が通る——通過（72 files / 907 tests）
- [ ] 5.3 `yarn build` が通り、生成された CSS に `sb-stroke-blink` の `@keyframes` と
      クラスの両方が出ていること、`@keyframes blink`（接頭辞なし）が消えていることを確認する
- [ ] 5.4 `yarn test:e2e` が通る

## 6. 仕上げ

- [ ] 6.1 成果物を commit する
- [ ] 6.2 ユーザーから完了承認を得て、同じタスクの中で `openspec/tickets/fold-stroke-css.md` の
      `status` へ `Wait-for-archive` と書く（`docs/agents/ticket-tracker.md`）
