---
status: Planning
change: remove-module-markdown
origin: user
tags:
  - proposal
  - design
  - specs
  - tasks
---

# remove-module-markdown

`modules/markdown` を、独立した Nuxt module（package 名 `@grrowapp/markxdown`、module 名・`configKey` は `markxdown`）として別リポジトリへ切り出す。切り出しに合わせて、`@nuxt/ui` が持つ部品と仕組みを自前で再実装している箇所を `@nuxt/ui` へ寄せる。

## 事実

起票時点で分かっていること。

- `modules/markdown` は Nuxt の `modules/` 自動読み込みで入る。`nuxt.config.ts` の `modules` には列挙されていない
- 自動読み込みは `nuxt.config.ts` の `modules` より後に走る。そのため `@nuxt/ui` の setup 時点では `@nuxtjs/mdc` が未登録で、`hasNuxtModule('@nuxtjs/mdc')` が偽になり、`@nuxt/ui` は Prose 一式を登録しない（`modules/markdown/index.ts` のコメント）
- 現状は Prose を切り（`components: { prose: false }`）、本文の見た目を自前の CSS `modules/markdown/runtime/assets/markdown.css`（353 行）で本家写しにしている
- コードブロックは `MarkdownCode.vue`、エディタの入力部品は素の `<textarea>` / `<button>`、図のエラー表示と読み込み表示は素の要素で組まれている
- `modules/markdown` が使う `@nuxt/kit` `@nuxtjs/mdc` `@vueuse/core` `mermaid` `remark-mdc` のうち、`@nuxt/kit` と `remark-mdc` は `package.json` に宣言が無く、hoist で解決されている
- 利用側の `app/assets/css/main.css` は 4〜17 行で `@source "../../../modules";` と、それが要る理由のコメントを持つ
- 公開しているのは `#markdown` alias 1 本。利用側は 7 ファイル（`app/components/review/AnnotateSource.vue`、`app/components/review/ApprovalAnnotator.vue`、`app/composables/useAnnotationHighlight.ts`、`app/pages/strokes/[sessionId]/proposal.vue`、`app/pages/projects/[projectId]/approvals/[approvalId].vue`、`app/pages/projects/[projectId]/steering/[name].vue`、`app/pages/projects/[projectId]/specs/[specName]/[document].vue`）
- 切り出し先 `~/work/markxdown` は stroke-board develop の clone として作成済み

## ユーザーが確定させたこと

- package 名 `@grrowapp/markxdown`（stroke の module なので gitea の org `grrowapp` と揃える）、module 名・`configKey: 'markxdown'`。切り出し先は `~/work/markxdown`
- markxdown は `@nuxt/ui` に peerDependency として依存し、`@nuxt/ui` が持つ部品と仕組みを自前で再実装しない
- Prose を有効化し、本文の見た目は `@nuxt/ui` の Prose theme（`ui.prose.*`）で本家写しを維持する
- `MarkdownCode.vue` を `ProsePre` にする。mermaid の振り分けを行う `MarkdownFence` は残す
- `MarkdownEditor.vue` の `<textarea>` / `<button>` を `UTextarea` / `UButton` にする
- `MarkdownDiagram.vue` のエラー枠と読み込み枠を `UAlert` / `USkeleton` にする
- markxdown は `nuxt.config.ts` の `modules` で `@nuxt/ui` より前に並べる。`modules/` ディレクトリの自動読み込みに頼らない
- CSS の配布は `@nuxt/ui` と同じ方式にする。package 側の CSS が `@source` を持ち、利用側は `main.css` の `@import` 1 行で取り込む。利用側の `@source "../../../modules";` とその説明コメントは削除する
- `useColorMode` は `@nuxt/ui` 経由で解決する。`@nuxtjs/color-mode` を直接の依存にしない
- `dependencies` は `@nuxt/kit` `@nuxtjs/mdc` `@vueuse/core` `mermaid` `remark-mdc`。`peerDependencies` は `vue` `vue-router` `@nuxt/ui`
- `ModuleOptions`（`headings.anchorLinks` / `rehypePlugins['rehype-raw']` / `components`）を `configKey: 'markxdown'` で公開する。stroke-board は既定値のみで使い、`nuxt.config.ts` に `markxdown` キーを置かない
- `#markdown` alias と、そこから引ける `render/MarkdownView.vue`・`render/MarkdownSource.vue`・`edit/MarkdownEditor.vue`・`position/*` は変えない。利用側 7 ファイルの import も変えない
- 切り出し先の構成は `@nuxt/module-builder` の標準（`src/module.ts` + `src/runtime/`、`playground/`、`nuxt-module-build build` で `dist/`）
- 履歴は `modules/markdown` の分を保って移す（`git subtree split` など）
- 命名の脱プロジェクト（`sb-*` / `sb-doc` / `MarkdownFence` など）は切り出し時に行う

## 既に終わっている作業

`~/work/markxdown` の `worktree-package-options` ブランチにコミット済み。stroke-board 側では `package-options` ブランチに当たる。

- `50f920f5` markdown module に ModuleOptions の口を開ける
- `210d33b8` エディタの入力部品を @nuxt/ui に寄せる
- `4eec3005` 図のエラー表示・読み込み表示を @nuxt/ui に寄せる

## 未決

- `openspec/specs/markdown/module` を markxdown 側へ移すか、stroke-board に残すか
