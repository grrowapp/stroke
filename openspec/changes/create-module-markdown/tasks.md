## 1. モジュールの置き場を用意する

- [x] 1.1 `modules/` を作り、Nuxt が自動で読むことを確かめる（`.nuxt/types/modules.d.ts` に `stroke-board-markdown` が現れる）
- [x] 1.2 `modules/markdown/` に `defineNuxtModule` の骨を置く。`runtime/` を持ち、alias `#markdown` を切る
- [x] 1.3 `yarn typecheck` が通ることを確かめる

## 2. markdown の解釈をモジュールへ移す

- [x] 2.1 `nuxt.config.ts` の `modules` から `@nuxtjs/mdc` を外し、`modules/markdown/` の中で `installModule` する
- [x] 2.2 `nuxt.config.ts` の `mdc` 設定ブロック（`headings.anchorLinks` / `rehypePlugins` の `rehype-raw` 無効化 / `components.prose` 無効化 / `components.map.pre`）をモジュール側へ移す。**値は変えない**
- [x] 2.3 `nuxt.config.ts` に markdown 由来の記述が残っていないことを確認する
- [x] 2.4 `yarn test` と `yarn test:e2e` が移設前と同じ結果であることを確かめる（単体 136/136 で基準と同一、E2E も基準と同じ失敗2件のみで増加なし）

## 3. 描画の部品をモジュールへ移す

- [x] 3.1 `app/components/global/MarkdownPre.vue` をモジュールへ移し、`addComponent({ global: true })` で登録する（名前は `MarkdownFence` に変えた）
- [x] 3.2 `components/global/` から名前解決できていた経路が、module 登録でも通ることを確かめる（mermaid フェンスが図になり、コードブロックに行番号と言語名の札が出ることを E2E で確認した）
- [x] 3.3 `app/components/workspace/CodeBlock.vue` と `MermaidDiagram.vue` をモジュールへ移す（`MarkdownCode` / `MarkdownDiagram` に改名した）
- [x] 3.4 `app/components/workspace/DocumentView.vue` をモジュールへ移し、本文を出す口とする（`MarkdownView`）
- [x] 3.5 `app/components/workspace/DocumentEditor.vue` をモジュールへ移し、直す口とする（`MarkdownEditor`）。保存の実行は口の外に残す
- [x] 3.6 `app/assets/css/main.css` の `.sb-markdown` / `.sb-code` / `.sb-mermaid` / `.sb-textarea` を `modules/markdown/runtime/assets/markdown.css` へ移し、モジュールが `nuxt.options.css.push` で自分で足すようにする
- [ ] 3.7 `test/app/components/workspace/markdown-roundtrip.test.ts` と `markdown-sanitize.test.ts` を移設先に合わせる
- [x] 3.8 `e2e/upstream-style.spec.ts` が基準と同じ結果であることを確かめる（本文の見た目が移設で変わっていないこと）

## 4. 描画の入口を1つに寄せる

- [x] 4.1 `app/components/review/ApprovalAnnotator.vue` の `<MDC>` 直呼びを、モジュールの口（`MarkdownView`）に置き換える
- [x] 4.2 `app/pages/strokes/[sessionId]/proposal.vue` の `<MDC>` 直呼び2箇所を、モジュールの口に置き換える
  - ストローク側は本家写しとは別のクラス列（`prose prose-sm dark:prose-invert max-w-none px-8 py-8`）で描いており、`.sb-markdown` をそのまま被せると枠と余白が二重になる。**型（prose）はモジュール、面（`.sb-markdown`）は呼ぶ側**に分け、`MarkdownView` に `surface` を持たせて解決した（既定は立てる。ストローク側だけ寝かせる）
- [x] 4.3 `app/pages/projects/[projectId]/approvals/[approvalId].vue` の参照を `#markdown` 経由の明示 import にする
- [x] 4.4 `<MDC` を直に書いている箇所が `modules/markdown/` の外に無いことを grep で確かめる（ヒット0件）
- [x] 4.5 `yarn test` と `yarn test:e2e` が緑であることを確かめる

## 5. 位置の口をモジュールに足す

- [ ] 5.1 markdown の解釈で `keepPosition` を立て、AST の各ノードに生テキストの位置が乗ることを確かめる
- [ ] 5.2 描画の前に text ノードを位置付きの包みへ変える処理を入れる
- [ ] 5.3 本文の見え方（改行位置・折り返し・字間）が包みの前後で変わらないことを `e2e/upstream-style.spec.ts` で確かめる
- [ ] 5.4 プレビュー面に「DOM の選択範囲 → 生テキストの位置」を実装する
- [ ] 5.5 プレビュー面に「生テキストの位置 → DOM の範囲」を実装する
- [ ] 5.6 `pre` ノードの位置から生テキストのフェンスを切り出し、表示されている文字列との差を洗い出す単体テストを書く（言語指定あり／なし、タブを含む、行頭に空白を持つ、末尾に空行を持つ、日本語を含む）
- [ ] 5.7 コードブロックの対応表を行ごとに作る実装を入れる。行内は先頭の空白の扱いを補正する
- [ ] 5.8 行数が合わないコードブロックを、対応の取れない領域として扱う分岐を入れる（生テキストを添える形に倒す）
- [ ] 5.9 図として描かれる箇所に、そのもとになった生テキストを添える口を作る。添えた生テキストはプレビュー面と同じ位置の口を実装する
- [ ] 5.10 生テキストを添えるのは、その図に注釈が1件以上付いているときだけにする
- [ ] 5.11 生テキストが添えられても本文の他の箇所の位置が動かないことを確かめる
- [ ] 5.12 位置の対応の単体テストを書く（強調・リンク・見出し・要素をまたぐ選択・コードブロックの内側・コードブロックをまたぐ選択・図に添えた生テキスト）
- [ ] 5.13 生テキストの面を `modules/markdown/` に置き、プレビュー面と同じ位置の口を実装する
