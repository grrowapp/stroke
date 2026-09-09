## Why

markdown を扱う実体が散っている。parse の設定は `nuxt.config.ts`、フェンスの振り分けは `app/components/global/`、コードブロックと図は `app/components/workspace/`、見た目は `app/assets/css/main.css` の約300行。描画の入口も `DocumentView` / `ApprovalAnnotator` / `proposal.vue` の3箇所に割れていて、`<MDC>` を直に呼ぶ側が3つある。**markdown 操作がどこに閉じるのかを定めた spec が無い**ため、次に markdown へ触る作業がどこを触ればよいのか、参照元を辿らないと分からない。

同じ理由で注釈も動けない。注釈は本家（`react-text-annotate-blend`）の写しで、**生 markdown のソース面にしか付けられない**。整形された本文を読みながら指摘したい場でも、指摘のためだけにソース面へ切り替える必要がある。

## What Changes

- Nuxt 4 標準の `modules/` を構造の規範に加える。以後、画面の階層に属さない自己完結の機能はここに置く
- **`modules/markdown/`** — markdown を描く・直す一式をここに閉じる。本家の承認レビューで使われている editor に相当する範囲（`@nuxtjs/mdc` の登録と parse 設定、フェンスの振り分け、コードブロック、mermaid、本文の器、編集の面、`.sb-markdown` / `.sb-code` / `.sb-mermaid` の CSS）
- markdown の描画の入口を、モジュールが公開する1つの口に寄せる。`<MDC>` を直に呼ぶ3箇所は無くなる
- **`modules/markdown/` が「描いた要素 ↔ 生 markdown の位置」の対応を公開する。** `@nuxtjs/mdc` の `keepPosition` が各ノードに載せる文字オフセットを、モジュールの外から引ける形にする
- 図として描かれるコードブロックに、元の生テキストを添えられるようにする。図を消して置き換えるのではなく併記する。添える範囲は外から受け取り、モジュールは注釈を知らない

**注釈はこの change に含めない。** `modules/annotation/` の作成、ソース面とプレビュー面の両方で注釈を付けられるようにすること、注釈の自前実装（`AnnotateSource.vue` 140行）を **CSS Custom Highlight API** と **VueUse `useTextSelection`** へ寄せることは、いずれも `create-module-annotation` が持つ。あちらはこの change が公開する位置の口の最初の利用者であり、口が揃うまで着手できない。

位置の口が要る理由はここにある。`<mark>` で包む方式のライブラリ（本家の `react-text-annotate-blend` を含む）はプレビュー面に載らない。強調やリンクを跨いだ選択で要素構造を壊すためである。DOM を書き換えずに範囲を塗る手段を採るなら、塗る側は「描かれた範囲 ↔ 生テキストの位置」を外から引けなければならない。

## Capabilities

### New Capabilities

- `markdown/module`: markdown を扱う実体の境界。何がモジュールの内側で、外へ何を公開するか（描く口・直す口・位置の口）。モジュールの外が `@nuxtjs/mdc` を直に触らないこと

注釈（`annotation/module`）はこの change に含めない。`create-module-annotation` が持つ。あちらはこの change が公開する位置の口の利用者であり、位置の口が揃うまで着手できない。

### Modified Capabilities

- `app-structure`: 現在「`app/components/` と `app/composables/` の配下は階層ディレクトリで分ける」「直下に直接置いてはならない」と定めており、`modules/` の居場所が無い。画面の階層に属さない自己完結の機能を `modules/` に置くこと、およびそれが階層ディレクトリの規範の対象外であることを加える

## Impact

**設定**
- `nuxt.config.ts` — `modules` 配列と `mdc` 設定ブロックがモジュール側へ移る。`keepPosition` を立てる

**画面**
- `app/components/global/MarkdownPre.vue` — モジュールへ移設。Nuxt module は `addComponent({ global: true })` で global 登録できるため、`components/global/` に置かざるを得なかった制約（`docs/specs/plan/structure-migration.md` が「規範に従えない唯一の例外」と記していたもの）が解ける
- `app/components/workspace/CodeBlock.vue` / `MermaidDiagram.vue` / `DocumentView.vue` / `DocumentEditor.vue` — モジュールへ移設
- `app/components/review/ApprovalAnnotator.vue` — `<MDC>` 直呼びがモジュールの口の呼び出しに変わる（両面の切替は `create-module-annotation`）
- `app/pages/strokes/[sessionId]/proposal.vue` / `app/pages/projects/[projectId]/approvals/[approvalId].vue` — `<MDC>` 直呼びがモジュールの口に変わる

`app/components/review/AnnotateSource.vue` と `app/composables/useAnnotations.ts` はこの change では触らない。注釈モジュールへの移設は `create-module-annotation` が持つ。
- `app/assets/css/main.css` — `.sb-markdown` / `.sb-code` / `.sb-mermaid` の約300行がモジュールへ移る

**依存**
- 追加は無い。`@nuxtjs/mdc` は導入済み

**テスト**
- `test/app/components/workspace/markdown-roundtrip.test.ts` / `markdown-sanitize.test.ts` — 移設先に合わせる（`adr0017-sub-create-reference-mdc` が引き取った）
- `e2e/document-editing.spec.ts` / `e2e/upstream-style.spec.ts` — 掴み所の変化に追随
- `e2e/markdown-hydration.spec.ts` — 解析を自前で組み直すとハイドレーションが壊れる件の検知（SSR の HTML とハイドレーション後の DOM の突き合わせ）

`e2e/approval-annotation.spec.ts`（プレビュー面での注釈）は `create-module-annotation` が持つ。

**資料**
- `docs/specs/core/system-structure.md` — ディレクトリ構造の規範に `modules/` を加える
- `docs/specs/core/file-components.md` / `file-composables.md` — 移設分の棚卸しを更新
- `docs/specs/plan/structure-migration.md` — `MarkdownPre` の例外が解けたことを反映
- `docs/specs/reference/mdc-observations.md` — `@nuxtjs/mdc` を実測で調べた事実を新設（`adr0017-sub-create-reference-mdc` が引き取った）

上記4件の構造資料は `update-docs-structure` が4件とも引き取った（ADR-0017「委譲の内訳」→「資料化」）。この change 側に残る作業は無い。
