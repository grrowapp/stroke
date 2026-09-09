## 1. 直し漏れの是正

- [x] 1.1 `openspec/tickets/adopt-upstream-design-tokens.md` の `status` へ `Doing` と書く（`docs/agents/ticket-tracker.md`）
- [x] 1.2 `app/pages/projects/[projectId]/tasks/[specName].vue:29-32` の状態のドット4個を `--status-*` へ寄せる——**寄せない**。本家のビルド成果物（`@pimzino/spec-workflow-mcp/dist/dashboard`）に `dotColor:"bg-gray-400"` / `"bg-orange-500"` / `"bg-green-500"` があり、3つとも一致した。`.vue` のコメント「点の色は本家の `statusConfig` の `dotColor` をそのまま使う」が正しく、D5（写しは写しのまま）が D6 に優先する（design D6 に実測を追記済み）
- [x] 1.3 `modules/markdown/runtime/render/MarkdownDiagram.vue` のエラー・ローディング表示の色が本家の実装からの写しか確かめる——**写しだった**。本家は `bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 my-4` / `text-red-700 dark:text-red-300` / `text-red-600 dark:text-red-400` / `bg-gray-100 dark:bg-gray-800 … animate-pulse` / `h-32 bg-gray-200 dark:bg-gray-700` / `text-gray-500 dark:text-gray-400` で、こちらは既定がダークなので dark 側だけを残した形
- [x] 1.4 1.3 の結果で振り分ける——**写しなので残した。** エラーとローディングの2箇所に、本家の className の写しであることと token へ寄せない理由をコメントで名指しした（design D5）
- [x] 1.5 `yarn typecheck` と `yarn test` が通ることを確かめる——通過（907 tests）

## 2. ハイライト5色の判別の確認

- [x] 2.1 `--surface-base`（#0f172a）と `--surface-panel`（#1e293b）の上に5色を重ね、隣り合う色どうしを見分けられるか確かめる——**判別できる。** 合成色を計算して照合した結果、5色どうしの色差は最小 ΔE 18.3（yellow vs orange。ΔE 10 以上で明確に区別できる）、地との色差は最小 ΔE 18.9（blue on panel）、本文（`--text-primary`）とのコントラストは最小 4.92:1 で WCAG AA（4.5:1）を満たす。下線（`text-decoration-color`）が不透明で色相を強く出すので、最も近い yellow/orange の区別はこれより明確
- [x] 2.2 見分けられない色があれば `bg` の alpha だけを調整する——**該当なし。変更していない**
- [x] 2.3 2.2 で変えた場合、`useAnnotations.ts` と `main.css` の `::highlight()` の両方を揃える——**該当なし**
- [x] 2.4 重なりの塗り（`sb-annotation-overlap`）と辿った範囲の塗り（`sb-annotation-focus`）が、5色の上でも判別できることを確かめる——**判別できる。** overlap の二重下線（`--text-primary`）と5色の塗りのコントラストは最小 4.92:1、focus（`--accent-primary` 不透明）と5色の色差は最小 ΔE 62.1。なお focus の地と文字（`#fff`）のコントラストは 4.47:1 で AA を 0.03 下回るが、1600ms だけ出る塗りであり、この change の範囲外として触っていない

## 3. ストロークの区画を作る

- [x] 3.1 `app/assets/css/main.css` の `@layer components` に**ストローク区画**を作り、仕切りのコメントを置く（1246行から。上層 145行 / 下層 746行 と混ぜない。design D1）
- [x] 3.2 `.sb-stroke-page` を定義する — 中央寄せ1カラム。`margin-inline:auto` / `max-width:42rem` / `padding-inline:24px` / `padding-top:56px` / `padding-bottom:160px`（現行 `mx-auto max-w-2xl px-6 py-14 pb-40` の写し。design D3）
- [x] 3.3 `--sb-stroke-bar-h: 57px` を定義する — sticky ヘッダーの高さ。**全幅2カラムのクラスは作らなかった**（使うのが1箇所で、`approved` で列数が変わる。design D3）
- [x] 3.4 `.sb-stroke-card` を定義する — 角丸・枠・地だけ。**混色は `in oklab`**（Tailwind の `bg-elevated/50` が生成する形に合わせた。`in srgb` だと色空間が変わって見た目がずれる）
- [x] 3.5 型（`text-sm` / `text-xs` / `text-lg`）に別名を被せていないことを確かめる——定義したのは寸法と面と高さだけで、`font-size` を1つも持たない

## 4. `.vue` を区画へ寄せる

- [x] 4.1 `app/pages/strokes/index.vue` と `app/pages/strokes/[sessionId]/index.vue` の器を `.sb-stroke-page` にする
- [x] 4.2 `app/pages/strokes/[sessionId]/proposal.vue` の `57px` を `--sb-stroke-bar-h` にする——**4箇所あった**（`min-h` 2箇所・`lg:top`・`lg:h`）。すべて置換し、`app/` 配下に `57px` の直書きは残っていない
- [x] 4.3 `proposal.vue` の生テキストの器 `px-4 py-4` を `px-8 py-8` に揃える。切り替えで本文の左端が飛ぶ理由をコメントに残した。横余白は縁 `px-6` / 本文 `px-8` / 脇 `px-5` の3段になった（design D4）
- [x] 4.4 `app/components/AgentQuestion.vue` と `app/components/StrokeBreadcrumb.vue` のカードを `.sb-stroke-card` にする
- [x] 4.5 区画へ移した property を `.vue` の `class` から外す——移した 9個（`mx-auto` `max-w-2xl` `px-6` `py-14` `pb-40` / `rounded-lg` `border` `border-default` `bg-elevated/50`）は消え、残るのは用途で変わる余白（`p-3` `p-4` `mb-4` `mt-3`）だけ

## 5. 確認

- [x] 5.1 `yarn typecheck` が通る
- [x] 5.2 `yarn test` が通る（907 passed）
- [x] 5.3 `yarn test:e2e` が通る（242 passed / 21.2m）
- [x] 5.4 余白と面が寄せる前と変わっていないことを確かめる——**生成 CSS で全宣言を突き合わせた。** `.sb-stroke-page{padding-inline:24px;max-width:42rem;margin-inline:auto;padding-top:56px;padding-bottom:160px}` と `.sb-stroke-card{border-radius:var(--radius-lg);border:1px solid var(--ui-border);background:color-mix(in oklab,var(--ui-bg-elevated) 50%,transparent)}` が、移す前の Tailwind クラスの生成物（`.bg-elevated\/50` を含む）と一致する。フォールバック（`color-mix` 非対応時に不透明）の形まで同じ。**この照合の途中で `in srgb` と書いていた誤りを見つけて直した**
- [x] 5.5 `main.css` の3区画（上層 145行 / 下層 746行 / ストローク 1275行）が仕切られたまま保たれていることを確かめる。ストロークの `.vue` は上層・下層のクラスを1つも使っておらず、`.sb-stroke-*` も他区画から使われていない

## 6. 仕上げ

- [x] 6.1 成果物を commit する——`c79d4db5`（7ファイル / +97 -11）
- [x] 6.2 ユーザーから完了承認を得て、同じタスクの中で `openspec/tickets/adopt-upstream-design-tokens.md` の `status` へ `Wait-for-archive` と書く（`docs/agents/ticket-tracker.md`）——承認を得て `Wait-for-archive` へ変更した（2026-09-02）
