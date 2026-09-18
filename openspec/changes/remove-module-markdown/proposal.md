## Why

`modules/markdown` は、外へ公開するものを `#markdown` alias 1 本に絞った自己完結の機能である（`openspec/specs/markdown/module`・`openspec/specs/app-structure` の「画面の階層に属さない機能は `modules/` に置く」）。stroke-board の外でも同じ形で使えるものが、stroke-board のリポジトリの中にしか無い。

同時に、この module は `@nuxt/ui` が持つ部品と仕組みを自前で作り直している。Prose を切って素のタグと自前 CSS（`modules/markdown/runtime/assets/markdown.css`、353 行）で本家の見た目を写し、コードブロック（`MarkdownCode.vue`）・エディタの入力部品（素の `<textarea>` / `<button>`）・図のエラー表示を素の要素で組んでいる。`@nuxt/ui` の theme 上書きの手間を避けた結果であり、package として配る形にすると、その手間の回避は割に合わない。package の利用者は `@nuxt/ui` の theme で見た目を変えられることを期待し、自前 CSS はその経路を塞ぐ。

Prose を切れていたのは、`modules/` の自動読み込みが `nuxt.config.ts` の `modules` より後に走り、`@nuxt/ui` の setup 時点で `hasNuxtModule('@nuxtjs/mdc')` が偽になるという読み込み順に依存している（`modules/markdown/index.ts` のコメント）。package になれば利用側が `modules` に列挙するため、この順序は反転する。今の作りは、切り出した先では前提から崩れる。

## What Changes

- `modules/markdown` を別リポジトリの package `markxdown` として切り出す。履歴は `modules/markdown` の分を保って移す
- 切り出し先の構成を `@nuxt/module-builder` の標準（`src/module.ts` + `src/runtime/`、`playground/`、`nuxt-module-build build` で `dist/`）にする
- **BREAKING** stroke-board は `markxdown` を依存として入れ、`nuxt.config.ts` の `modules` へ `@nuxt/ui` より前に列挙する。`modules/markdown/` はリポジトリから消える
- Prose を有効化し、本文の見た目を `@nuxt/ui` の Prose theme（`ui.prose.*`）で持つ。自前 CSS で写していた見た目はそちらへ移す
- `MarkdownCode.vue` を `ProsePre` に置き換える。mermaid のフェンスを図へ振り分ける `MarkdownFence` は残す
- `MarkdownEditor.vue` の `<textarea>` / `<button>` を `UTextarea` / `UButton` にする（実施済み）
- `MarkdownDiagram.vue` のエラー枠と読み込み枠を `UAlert` / `USkeleton` にする（実施済み）
- CSS の配布を `@nuxt/ui` と同じ方式にする。package 側の CSS が `@source` を持ち、利用側は `main.css` の `@import` 1 行で取り込む。利用側の `@source "../../../modules";` とその説明コメント（`app/assets/css/main.css` の 4〜17 行）は消える
- `ModuleOptions`（`headings.anchorLinks` / `rehypePlugins['rehype-raw']` / `components`）を `configKey: 'markxdown'` で公開する（実施済み）
- 依存を package の `package.json` に宣言する。`dependencies` は `@nuxt/kit` `@nuxtjs/mdc` `@vueuse/core` `mermaid` `remark-mdc`、`peerDependencies` は `vue` `vue-router` `@nuxt/ui`
- 名前から stroke-board 固有の要素（`sb-*` / `sb-doc` / `MarkdownFence`）を外す

### 変えないもの

- `#markdown` alias と、そこから引ける `render/MarkdownView.vue`・`render/MarkdownSource.vue`・`edit/MarkdownEditor.vue`・`position/*`
- 利用側 7 ファイルの import（`app/components/review/AnnotateSource.vue`、`app/components/review/ApprovalAnnotator.vue`、`app/composables/useAnnotationHighlight.ts`、`app/pages/strokes/[sessionId]/proposal.vue`、`app/pages/projects/[projectId]/approvals/[approvalId].vue`、`app/pages/projects/[projectId]/steering/[name].vue`、`app/pages/projects/[projectId]/specs/[specName]/[document].vue`）
- 位置の対応（`position/`）の振る舞いと基準
- 生 HTML を描かないこと（`rehypePlugins: { 'rehype-raw': false }` の既定値）
- 画面の遷移・操作の可否（本 change は画面遷移に一切触れない。[ADR 0025](../../../docs/adr/0025-no-unilateral-navigation-changes.md)）

## Capabilities

### Modified Capabilities

- `markdown/module`: markdown を扱う実体の置き場が、このリポジトリの `modules/markdown/` から外部 package `@grrowapp/markxdown` へ移る。実体が1箇所に閉じることと、公開するものが `#markdown` に絞られることは変わらない。加えて、読み込み順（`@nuxt/ui` より前）と CSS の取り込み方（`@import` 1 行）が、利用側に要る手続きとして新しく規定に入る
- `app-structure`: `modules/` に置く判定の行き先に「外部 package として配る」が加わる。`modules/` を名指ししている参照の規定とテストの置き場の規定が、外部 package の場合にどうなるかを定める

## Impact

**切り出し元（stroke-board）**

- `modules/markdown/**`（15 ファイル）— 消える
- `package.json` — `markxdown` を依存に足す。`@nuxtjs/mdc` `mermaid` は markxdown 側の `dependencies` へ移る
- `nuxt.config.ts` — `modules` の先頭に `markxdown` を置く（`@nuxt/ui` より前）
- `app/assets/css/main.css` — `@source "../../../modules";` とその説明コメント（4〜17 行）を消し、`markxdown` の CSS を `@import` する
- `test/modules/markdown/**` — 写し元が外部 package へ移るため、扱いを決める

**切り出し先（`~/work/markxdown`）**

- `src/module.ts` + `src/runtime/**` — `@nuxt/module-builder` の構成へ移す
- `package.json` — 名前・`configKey`・`dependencies` / `peerDependencies` の宣言
- `playground/` — 動作確認の置き場

**資料**

- `openspec/specs/markdown/module` — 置き場（markxdown 側 / stroke-board 残置）が未決。tasks で決める
- `docs/specs/structure/system-structure.md` — `modules/` から markdown が消えるため、ディレクトリ構造への整合反映が要るか確認する
- `docs/specs/core/settings-reference.md` — 対象外。`markxdown` の `ModuleOptions` は設定の置き場2つ（`nuxt.config.ts` の `runtimeConfig`・`app/app.config.ts`）のどちらでもなく、stroke-board は既定値のみで使い `nuxt.config.ts` に `markxdown` キーを置かないため、この資料に載せる値が無い

**テスト**

- `test/modules/markdown/**` の単体テスト（位置の対応の 12 本を含む）
- markdown 本文の描画に依存する E2E

**対象外**

- 画面の遷移・操作の可否
- `position/` の振る舞いと基準
- markdown 以外の `modules/` 配下（現在は無い）
