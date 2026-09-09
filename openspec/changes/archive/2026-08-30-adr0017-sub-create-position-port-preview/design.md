## Context

動機は `proposal.md` の Why、満たすべき振る舞いは `specs/markdown/module/spec.md` を参照。

実装を制約する条件が4つある。いずれも実測。

**1. 先例が既に在る。** `MarkdownSource.vue` は `useTemplateRef<HTMLElement>('root')` で器を掴み、呼ばれるたびに `createPlainPositionPort({ container, source })` を作り、`defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` で出している。`createPreviewPositionPort({ container, source })` は同じ引数の形を採る（`position/preview.ts:366`）。**新しい形を考える必要はない。**

**2. `MarkdownView` の描画は非同期である。** `<MDC>` は内部で `useAsyncData` + `parseMarkdown` を呼ぶ。器の `<div>` は `props.value` が真なら即座に在るが、その中身（`MDCRenderer` が描く本文と `data-src-start` の包み）は解析が終わるまで無い。`MarkdownSource` は補間1つなので、この段差が無い。

**3. `<MDC>` の解析には触れない。** 一度 `parseMarkdown` を自前で呼ぶ形に書き換えたところ、クライアント側で解析がもう一度走って shiki の色が SSR と食い違い、ハイドレーションが壊れて**アプリ全体のアイコンが消えた**（実測。markdown 本文には症状が出ず、全画面のピクセル差分だけが捕まえた）。`MarkdownView.vue:114` のコメントがこれを警告している。

**4. 既存の単体テストは Nuxt 実行環境を意図的に避けている。** `test/modules/markdown/runtime/position/preview.test.ts` は冒頭で理由を明記している — `MDCRenderer` を通すには `#components`・global 登録された `MarkdownFence`・図が使う `useColorMode` が要り、単体テストに Nuxt のビルドと shiki を引き込むことになる。そこで AST から直に DOM を組んでいる。`MarkdownView.vue` は `#components` から `MDCRenderer` を import しているので、**コンポーネントそのものを検査するにはこの specifier を解決する必要がある**（決定4）。

## Goals / Non-Goals

**Goals:**

- `MarkdownSource` と `MarkdownView` が外から見て区別の付かない形で位置の対応を出す
- 公開が消えたことを検知できる状態にする

**Non-Goals:**

- 位置変換そのものの正しさを作り直すこと。`preview.ts` は実装済みで、単体テスト35本が固定している。この change は**公開の手続きだけ**を足す
- 正規化の責務を決めること（`adr0017-sub-fix-normalization-offset` が決める）
- 位置変換を実際に使う側を作ること。使う側は `adr0017-sub-create-module-annotation`

## Decisions

### 決定1: `MarkdownSource` と同じ形にする（`useTemplateRef` ＋ `defineExpose`）

器の `<div v-if="props.value">` に `ref` を付け、`defineExpose({ toSourceRange, toDomRange } satisfies PositionPort)` を置く。描画に使う要素そのものは外へ出さない。

**代替1: 器の要素を `defineExpose` で出し、呼ぶ側にポートを作らせる。** 却下。使う側が `createPreviewPositionPort` と `createPlainPositionPort` を知ることになり、面の違いで分岐する。spec の「面によって手続きを分けてはならない」に反する。

**代替2: composable（`useMarkdownPosition()`）にする。** 却下。器の要素は面の内部にあり、composable では掴めない。掴ませるには結局要素を外へ出すことになり、代替1と同じ問題になる。

**代替3: provide/inject で降ろす。** 却下。inject は子孫にしか届かない。位置変換を使うのは `MarkdownView` の**呼び出し側**（親）である。`sourceShown` が provide なのは、逆に MDC が自分で作る子孫（`MarkdownFence`）へ届ける必要があるからで、向きが違う。

### 決定2: ポートは呼ばれるたびに作る

インスタンスを保持しない。`MarkdownSource` の `port()` と同じで、`toSourceRange` / `toDomRange` のたびに器を走査し直す。

`preview.ts:373` が理由を書いている — 選択のたびに器の中の包みとフェンスを読み直す必要があり、保持しても再利用できるものが無い。本文が描き換わったときに古い表を返す危険だけが増える。

**代替: `computed` でポートを保持し、`props.value` で無効化する。** 却下。`props.value` が同じでも DOM は変わりうる（`<MDC>` の解析完了、フェンスの図の描画完了）。無効化の条件を正しく書けない。

### 決定3: `source` は `props.value` をそのまま渡す

面は渡された文字列を基準に答える（spec「位置は面に渡された文字列の先頭を基準とする」）。改行の表現や front matter をここで揃えない。

**この決定には既知の穴がある。** `parseMarkdown` は内部で CRLF を LF に正規化し、front matter を除いてから解析する。したがって `data-src-start` に載るオフセットは**正規化後の文字列**を指す。`props.value` が未正規化のまま渡されると、包みのオフセットと `source` の基準が食い違う。実測では `null` に倒れず、**黙って別の場所を返す**（親 change の tasks 6.7）。

ここで正規化してしまえば穴は塞がるが、それは「誰が正規化するか」を決めることであり、後続 `adr0017-sub-fix-normalization-offset` の領分である。この change では**型のドキュメントに基準を明記するに留める**。塞ぐのは後続。

### 決定4: 検知は happy-dom のコンポーネントテストで行い、Nuxt の解決は alias で置き換える

`test/modules/markdown/runtime/render/markdown-view-position.test.ts` を `// @vitest-environment happy-dom` で置き、`@vue/test-utils` の `mount` でマウントする。Nuxt の specifier は `vitest.config.ts` の alias で解決する。

- `#imports` → `vue`。`MarkdownView` が使うのは `useTemplateRef` だけで、Vue 3.5 が同名で持つ
- `#components` → `test/stubs/nuxt-components.ts`。`MDCRenderer` のダミーを1つ出すだけ
- `<MDC>` は `global.stubs` で差し替え、`markSourcePosition` が付けるのと同じ形の包みを直に置く

見るのは4点。

- マウントした結果が `toSourceRange` と `toDomRange` を持つこと（`defineExpose` を外したら落ちる）
- `props.value` が空のとき、どちらも `null` を返すこと
- 描かれた範囲から生テキストの位置が引けること（経路が繋がっていることの確認）
- 生テキストの位置から描かれた範囲が引けること

**当初はこれを `@vitest-environment nuxt` で行う設計だった。実装で前提が崩れた。**

このリポジトリで `@vitest-environment nuxt` は動かない（実測）。中身が `expect(true).toBe(true)` だけの空のテストでも落ちる。

- 環境ラベルが `|node|` になる。`nuxt` 環境として登録されておらず node にフォールバックしている
- それでも `@nuxt/test-utils` が仕込む `beforeAll`（`dist/runtime/entry.mjs`）は走り、そこで固まる
- `Hook timed out in 10000ms` が出るが、**`--hookTimeout=180000` を渡しても 10000ms のまま**動かせない
- 組み合わせは vitest 4.1.11 + `@nuxt/test-utils` 4.1.0。このリポジトリに `@vitest-environment nuxt` を使う既存テストは1本も無く、これまで誰も踏んでいなかった

**`test/stubs/` はこの change が作る新しい置き場である。** `test/` の規範は「ソースの構造をそのまま写す」だが、alias の解決先はソースに対応物を持たない。テストでないファイルが `test/` 直下に入るのはこれが初めてなので、増やすときは規範の側を先に決めること。

**代替1: `<MDC>` をスタブせず実物を通す。** 却下。shiki と `@nuxt/icon` を単体テストへ引き込む。変換の正しさは `preview.test.ts` の35本が既に固定しており、ここで確かめたいのは「公開されているか」だけである。

**代替2: `@vitest-environment nuxt` で `mountSuspended` する。** 却下。上記のとおり動かない。直すには `@nuxt/test-utils` か vitest のバージョンを動かす調査が要り、Wave 0 が依存解決に引きずられる。

**代替3: E2E で確かめる。** 却下。位置変換は画面に何も出さない。使う側（注釈）が居ないうちは E2E で観測できるものが無く、観測するには注釈側を先に作ることになって依存が逆転する。

### 決定5: `MarkdownEditor` は中継しない

`proposal.md` の「対象外」のとおり。注釈が付く承認レビュー画面は `MarkdownEditor` を使わず `MarkdownView` を直に使う（`MarkdownEditor.vue:5`）。

加えて技術的な理由がある。`MarkdownEditor` は `MarkdownView` を2箇所（編集中プレビュー・読みモード）で `v-if`/`v-else` して出している。中継するなら「どちらの `MarkdownView` を指すか」を決める必要があり、それは編集中に注釈を付けられるかという**注釈側の仕様**に依存する。決まっていないものを先回りして形にしない。

## Risks / Trade-offs

| # | リスク | 緩和 |
|---|---|---|
| R1 | 未正規化の文字列を渡されると黙って誤った位置を返す（決定3） | 型のドキュメントに基準を明記する。塞ぐのは `adr0017-sub-fix-normalization-offset`。この change では**穴を作らず、既に在る穴を公開するだけ**である点に注意する（`MarkdownSource` は既に同じ穴を持つ） |
| R2 | `<MDC>` の解析が終わる前に呼ぶと、器は在るが中身が無い | **実測で解消（tasks 1.1）。** 解析前の器は子ノードを1つも持たないため、両方向とも `null` が返る。切り詰めた値も例外も返さない。したがって「包みが1つも無ければ `null`」の分岐（tasks 2.3）は要らない |
| R3 | `MarkdownView` を触ってハイドレーションを壊す（Context 3） | 解析の段（`<MDC>` と `parser-options`）に触れない。足すのは器の `ref` と `defineExpose` だけ。`e2e/markdown-hydration.spec.ts` が変わらないことを確かめる |
| R4 | Nuxt 環境のテストを1本入れることで、単体テストの実行時間が伸びる | 1本に留める。変換の検査は既存の happy-dom テストのまま置く |
| R5 | `defineExpose` は型では守られない。`satisfies PositionPort` は書いたものの形しか見ず、**書かなくなったこと**は検知しない | 決定4のテストがこれを担う。`adr0017-sub-add-detection-assumptions` の 6.1.1 が後から `MarkdownView` の形そのものを固定する |
| R6 | **（tasks 1.1 で発見。この change の範囲外）** 包みが1つも無い本文で器ぜんたいを選ぶと、`null` に倒れず**切り詰めた範囲を返す**。実測: 生テキスト `これは本文です。\n\n次の段落。\n` に対し正解が `0..15` 相当のところ `{start:0,end:8}` が返った。2段落目だけを選べば `null` になるので、条件は「選択が最初の一続きで終わっている」ときに限られる | この change は穴を作らない（`markSourcePosition` は通ったままである）。塞ぐのは `adr0017-sub-add-detection-assumptions` の 6.4.2（位置の印が DOM に出ないことの検知）と 6.5.2（逃げ道が推測を黙って通さないこと）。**この行を根拠として向こうへ持ち込むこと** |

## Migration Plan

段階は無い。既存の呼び出し側は `MarkdownView` を props だけで使っており、公開が増えても影響を受けない。

ロールバックは `defineExpose` と `ref` を外すだけで元に戻る。データも設定も動かさない。
