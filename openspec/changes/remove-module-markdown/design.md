## Context

動機は [proposal.md](./proposal.md)「Why」。要件は [specs/](./specs/)。

今の `modules/markdown` は 15 ファイルで、次の形をしている。

| 置き場 | 中身 |
| --- | --- |
| `index.ts` | `defineNuxtModule`。`@nuxtjs/mdc` の `installModule`、`#markdown` alias、`MarkdownFence` の global 登録、CSS の `nuxt.options.css.push` |
| `runtime/render/` | `MarkdownView.vue`・`MarkdownSource.vue`・`MarkdownFence.vue`・`MarkdownCode.vue`・`MarkdownDiagram.vue`・`source-shown.ts` |
| `runtime/edit/` | `MarkdownEditor.vue` |
| `runtime/position/` | 位置の対応（`plain.ts`・`preview.ts`・`fence.ts`・`normalize.ts`・`source-span.ts`・`types.ts`） |
| `runtime/assets/markdown.css` | 本文の見た目（353 行。`@layer sb-doc`） |

制約になるのは次の4つ。

- **読み込み順が反転する。** 今は `modules/` の自動読み込みが `nuxt.config.ts` の `modules` より後に走るため、`@nuxt/ui` の setup 時点で `hasNuxtModule('@nuxtjs/mdc')` が偽になり、Prose 一式が登録されない。package になれば利用側が `modules` に列挙するので、`@nuxt/ui` より前に置けば `@nuxtjs/mdc` が先に入る
- **公開しているものは変えられない。** `#markdown` alias と利用側 7 ファイルの import は本 change の対象外（proposal.md「変えないもの」）
- **Tailwind の走査の指定は利用側の `main.css` に集まる。** `@import "tailwindcss"` を持つファイルが入口で、module 側の CSS に `@source` を書いても効かない（`app/assets/css/main.css` の 6〜16 行のコメント。実測の記録つき）
- **位置の対応のテストが `<MDC>` の実際の描画で形を固定している。** `test/modules/markdown/runtime/render/markdown-view-position.test.ts` の 12 本が、自前の `parseMarkdown` 呼び出しへ書き換えると落ちる（`modules/markdown/index.ts` のコメント。実測 2026-08-30）

## Goals / Non-Goals

**Goals:**

- markdown を扱う実体が `markxdown` package の中だけに在り、stroke-board のリポジトリに残らない
- stroke-board の利用側 7 ファイルが、切り出しの前後で変わらない
- `@nuxt/ui` が提供する部品と仕組みを、markxdown が自前で作り直していない
- markxdown を入れた別のアプリが、`@nuxt/ui` の theme で本文の見た目を変えられる

**Non-Goals:**

- `#markdown` alias とその下の path の変更
- 位置の対応（`position/`）の振る舞い・基準の変更
- 画面の遷移・操作の可否への変更
- markxdown の npm 公開（配布の形は本 change で決めない）

## Decisions

### D1: 利用側は `nuxt.config.ts` の `modules` で `@nuxt/ui` より前に列挙する

`modules/` ディレクトリの自動読み込みには頼らない。

- **なぜ** — `@nuxt/ui` は setup 時に `hasNuxtModule('@nuxtjs/mdc')` を見て Prose 一式を登録する（`@nuxt/ui/dist/module.mjs:121`。`modules/markdown/index.ts` のコメントが実測を記録している）。markxdown が `@nuxtjs/mdc` を `installModule` するため、markxdown が先に走らないと Prose が登録されない。D2 で Prose に寄せる以上、この順序は機能の前提である
- **なぜ自動読み込みに頼らないか** — 外部 package は `modules/` ディレクトリに現れない。package として配る以上、利用側が `modules` へ書く形しか無い
- 順序が満たされないときに起きるのは、Prose 一式が登録されず本文の見た目が素のタグのままになることである。落ちないので、規定として spec に持つ（[specs/markdown/module/spec.md](./specs/markdown/module/spec.md)）

### D2: 本文の見た目は `@nuxt/ui` の Prose theme で持つ

`components: { prose: false }` をやめ、自前 CSS `runtime/assets/markdown.css`（353 行）で写していた見た目を `ui.prose.*` の theme 上書きへ移す。

- **なぜ** — 自前 CSS は `@nuxt/ui` の Prose を打ち消すために在る。package の利用者にとって、見た目を変える経路は `@nuxt/ui` の theme であり、打ち消しが入っているとその経路が働かない
- **本家写しの見た目は維持する。** 移すのは持ち方であって、見え方ではない
- **不採用: 自前 CSS のまま配る** — `@nuxt/ui` を peerDependency に持ちながら、その Prose を打ち消す CSS を同梱することになる。利用者から見て、どちらが効くかが読めない

### D3: `MarkdownCode.vue` を `ProsePre` にし、`MarkdownFence` は残す

- **なぜ `ProsePre` へ** — D2 で Prose が有効になるので、コードブロックの見た目は `@nuxt/ui` が持つ。自前の `MarkdownCode.vue` は同じものを作り直している
- **なぜ `MarkdownFence` を残すか** — あれはコードブロックの見た目ではなく、`language` を見て mermaid だけを図へ回す振り分けである。`@nuxt/ui` にこの働きは無い（`modules/markdown/index.ts` のコメント「本家は mermaid のフェンスを図（SVG）にしているが、shiki は生ソースのコードブロックにしてしまう」）。振り分けの先が `MarkdownCode.vue` から `ProsePre` に変わるだけである
- 名前は切り出し時に脱プロジェクト化する（D7）

### D4: エディタと図の部品を `@nuxt/ui` に寄せる（実施済み）

`MarkdownEditor.vue` の `<textarea>` / `<button>` を `UTextarea` / `UButton` に、`MarkdownDiagram.vue` のエラー枠・読み込み枠を `UAlert` / `USkeleton` にする。

`~/work/markxdown` の `worktree-package-options` ブランチにコミット済み（`210d33b8`・`4eec3005`）。

**archive 済み change `adopt-upstream-design-tokens` は、`MarkdownDiagram.vue` のエラー表示・読み込み表示について「本家の写しは写しのまま残す」側の判定を保留していた。本 change はそれと違う判定を採る。** 根拠は、markxdown が `@nuxt/ui` を peerDependency として持ち、`@nuxt/ui` の部品を自前で組み直さないと決めたことである（ユーザー確定事項）。写しとして残す利点は stroke-board の中でしか成立せず、package の利用者にとっては `@nuxt/ui` の theme が効かない箇所が増えるだけになる。

なお archive 済み change は規範の参照先にならない（`docs/agents/issue-tracker.md`「過去の記録」）。ここに書いたのは、同じ箇所を逆向きに触ることの申し送りである。

### D5: CSS の配布は `@nuxt/ui` と同じ方式にする

package の CSS が `@source` を持ち、利用側は `main.css` で `@import` 1 行だけ書く。利用側の `@source "../../../modules";` と 4〜17 行の説明コメントは削除する。

- **なぜ** — `@nuxt/ui` が同じ形を採っており、利用側は `@import "@nuxt/ui";` の1行で済んでいる（`app/assets/css/main.css:2`）。markxdown だけ別の作法を要求する理由が無い
- **今の `@source "../../../modules";` は、module がリポジトリの中に在ることが前提である。** package になればその path は当たらない。削除は整理ではなく、前提が消えることへの追随である
- D2 で本文の見た目が `ui.prose.*` へ移るため、`@source` が守っていた「モジュールの中だけが名乗るクラスが生成されない」問題（コメントに実測が残る `sm:prose-base` の欠落）がそのまま同じ形で残るかは、apply 時に実際のビルド成果物で確かめる（tasks 4 章）

### D6: `useColorMode` は `@nuxt/ui` 経由で解決する

`@nuxtjs/color-mode` を markxdown の直接の依存にしない。

- **なぜ** — `@nuxt/ui` が `@nuxtjs/color-mode` を入れる。peerDependency として `@nuxt/ui` を要求する以上、その中に在るものを二重に宣言すると、利用側で版が割れうる

### D7: 名前から stroke-board 固有の要素を外す

`sb-*`（CSS クラス）・`sb-doc`（CSS レイヤー）・`MarkdownFence`（component 名）などを、切り出しのタイミングで package の名前へ改める。

- **なぜこのタイミングか** — 履歴を保って移す（D8）ので、移した後に改名すると、markxdown の履歴の中で名前が一度変わる。移す作業自体が全ファイルを触るので、同じ作業の中で済む
- 具体の新しい名前は apply 時に決める。本 change では「stroke-board 固有の要素を残さない」ことだけを決める

### D8: 履歴は `modules/markdown` の分を保って移す

`git subtree split` などで `modules/markdown` に触れたコミットだけを取り出し、markxdown の履歴の土台にする。

- **なぜ** — この module のコメントは実測の記録を多く持ち（`keepPosition` が型で止まること、自前 `parseMarkdown` でハイドレーションがずれてアイコンが消えたこと）、どのコミットで何が分かったかが追えなくなると、同じ失敗を繰り返す
- **不採用: ファイルをコピーして新規の履歴から始める** — 上の記録が、コメントの文面としてしか残らない

### D9: 依存を package の `package.json` に宣言する

`dependencies` は `@nuxt/kit` `@nuxtjs/mdc` `@vueuse/core` `mermaid` `remark-mdc`。`peerDependencies` は `vue` `vue-router` `@nuxt/ui`。

- **なぜ明記が要るか** — 現状 `@nuxt/kit` と `remark-mdc` は stroke-board の `package.json` に無く、hoist で解決されている。package になると利用側の hoist は当てにできない
- **なぜ `@nuxt/ui` が peerDependency か** — D2・D3・D4 で見た目と部品を `@nuxt/ui` に預ける。利用側のアプリが持つ `@nuxt/ui` と同じ1つを使わないと、theme の上書きが届かない

### D10: `ModuleOptions` は設定リファレンスの対象外（実施済み）

`configKey: 'markxdown'` で `headings.anchorLinks` / `rehypePlugins['rehype-raw']` / `components` を公開する。`~/work/markxdown` の `50f920f5` にコミット済み。

`docs/specs/core/settings-reference.md`（[ADR 0004](../../../docs/adr/0004-settings-reference-is-authoritative.md)）には載せない。

- **なぜ対象外か** — あの資料が正としているのは設定の置き場2つ（`nuxt.config.ts` の `runtimeConfig` と `app/app.config.ts`）に入る値である。`markxdown` の `ModuleOptions` はそのどちらでもなく、加えて stroke-board は既定値のみで使い `nuxt.config.ts` に `markxdown` キーを置かない。資料に載せる値が1つも無い
- stroke-board が将来 `markxdown` キーを置くときは、その時点で載せるかを判断する

### D11: `openspec/specs/markdown/module` の置き場は決めない（未決）

markxdown 側へ移すか、stroke-board に残すかを本 change では決めない。tasks の「決める」項目として置く。

- **判断に要る材料** — markxdown が自分の spec を持つ運用にするか、stroke-board が利用側として要件を持ち続けるか。前者なら markxdown 側に openspec の運用を作る話になり、本 change の範囲を超える
- **どちらに決めても、本 change の delta は成立する。** delta が書き換えるのは要件の文面であって、置き場ではない

## Risks / Trade-offs

- **Prose を戻すと、自前 CSS が効かなくなっていた箇所が見た目を変える** → 本文の見え方は本家写しのまま維持するのが D2 の前提。apply では見た目の一致を確かめてから進める（tasks 4 章）
- **読み込み順が規定でしか担保されない** → 順序を間違えても落ちず、見た目が素のタグに戻るだけになる。spec の要件として持ち、テストで確かめる（tasks 4 章）
- **`test/modules/markdown/**` の写し元が外部 package へ出る** → `openspec/specs/app-structure` の「テストは写し元の構造に従う」に当たる。追随先が同じリポジトリに無いため、delta で扱いを定める
- **package として配る形（npm 公開 / ファイル参照 / git 参照）を決めていない** → stroke-board が `markxdown` をどう引くかは apply で決める。決め方によって `package.json` の書き方だけが変わり、本 change の要件は変わらない
- **切り出し後、stroke-board 側で markdown を直したいときに2つのリポジトリを跨ぐ** → 外へ配る package にするという判断そのものの代償であり、避けられない

## Migration Plan

1. `~/work/markxdown` を `@nuxt/module-builder` の構成へ移し、履歴を保って `modules/markdown` の分を取り込む（D8）
2. Prose を有効化し、見た目を `ui.prose.*` へ移す。`MarkdownCode.vue` を `ProsePre` にする（D2・D3）
3. 依存を宣言し、CSS の配布を `@import` 1 行の形にする（D5・D9）
4. 名前から stroke-board 固有の要素を外す（D7）
5. stroke-board 側で `markxdown` を依存に入れ、`nuxt.config.ts` の `modules` へ `@nuxt/ui` より前に列挙し、`modules/markdown/` を消す（D1）
6. `app/assets/css/main.css` の `@source` と説明コメントを消し、`markxdown` の CSS を `@import` する（D5）
7. テストの置き場を決めて追随させる

5 と 6 の間で止めると、Tailwind の走査から markdown のクラスが落ちたまま module が消えた状態になる。同じコミットにまとめる。

## Open Questions

- `openspec/specs/markdown/module` を markxdown 側へ移すか、stroke-board に残すか（D11）。tasks で決める
