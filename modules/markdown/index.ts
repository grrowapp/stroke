import { addComponent, createResolver, defineNuxtModule, installModule } from '@nuxt/kit';
import { defu } from 'defu';
import type { ModuleOptions as MdcModuleOptions } from '@nuxtjs/mdc';

/**
 * 本文の見た目のうち、**`@nuxt/ui` の Prose の既定から動かす分**。
 *
 * 型（見出し・段落・箇条書き・罫線の寸法）は Tailwind Typography（`prose prose-sm
 * sm:prose-base dark:prose-invert …`＝本家 `MDXEditorWrapper.tsx` の
 * `contentEditableClassName` の写し）が持つ。ここに置くのは2種類だけ。
 *
 * 1. 本家の MDXEditor が prose の上に重ねている差分（表・インラインコード・リンク・引用）。
 *    もとは `runtime/assets/markdown.css` の `@layer sb-doc` に在った。
 * 2. `@nuxt/ui` の Prose が持ち込む指定のうち、上の型と食い違う分の打ち消し。
 *    実測（Prose を有効にする前後で計測）で出たのは次の5件:
 *      - `ProseH1` の `font-bold` が prose の 800 に勝って 700 になる
 *      - `ProseTable` が入れ物の `div`（`my-5 overflow-x-auto rounded-md`）を増やし、角丸が付く
 *      - `ProseTh` / `ProseTd` の `text-sm` が字を 14px から 12px へ落とす
 *      - `ProseTr` の角丸（`rounded-ss-md` など）が表の四隅に付く
 *      - `ProseCode` の `border border-muted` で枠が出て、`text-sm` が字送りを詰める
 *
 * 同じ slot に競合するユーティリティを書けば、`tv` が `tailwind-merge` で後勝ちに解決する。
 * CSS の並び順に頼らないので、打ち消しはこの形で書くこと。
 *
 * **prose に勝たせたいものには `!` を付ける。** 以前は `@layer sb-doc` が prose より後の
 * レイヤーに居たので素の指定で勝てたが、theme のユーティリティは prose と同じレイヤーに
 * 載るため、`:where()` に子の指定を含む規則（表のセル・リンク・引用）には負ける。
 *
 * リンクと引用は e2e の文書（steering の product.md）に出てこないので、計測で確かめられて
 * いない。値は移す前の `@layer sb-doc` と同じで、`!` も同じ「prose に勝つ」ためのもの。
 */
const PROSE_THEME = {
  /* prose は 800。`@nuxt/ui` の `font-bold`（700）を戻す */
  h1: { slots: { base: 'font-extrabold' } },

  /*
   * リンク。prose（invert）の既定は白。本家は `MDXEditorWrapper.css` の
   * `.mdx-editor-wrapper a { color: var(--accentText) }` で青にしている。
   * 実測 rgb(112,184,255)。太さ 500 と下線は prose のまま。
   */
  a: { base: 'text-[rgb(112,184,255)]!' },

  /*
   * 引用。`MDXEditorWrapper.css` の `blockquote`（border-left 4px var(--accentBase) /
   * padding-left 1rem / margin 1rem 0 / ダーク時 color #9ca3af）。斜体と 500 は prose のまま。
   * 枠色の rgb(13,21,32) は @mdxeditor のダークテーマが入れた `--accentBase`。
   */
  blockquote: { base: 'my-4! ps-4! border-s-4! border-[rgb(13,21,32)]! text-[#9ca3af]!' },

  /*
   * インラインコード。本家は Lexical が `code > span._code_` の二重構造で出し、目に入るのは
   * 内側（実測: 本文 16px の中で 13.16px ＝ 0.875em × 0.94 / 600 / 面 rgb(33,34,37) /
   * padding 1px 4px / 角丸なし）。MDC は `code` 1枚しか出さないので、その値をここへ持たせる。
   * バッククォートは prose の `code::before/::after` がそのまま出す。
   *
   * `border-0` と `/[1.75]` は `@nuxt/ui` の打ち消し（枠と字送り）。1.75 は prose の字送り。
   */
  code: {
    base: 'px-1! py-px! rounded-none! border-0! bg-[rgb(33,34,37)]! text-[0.8225em]/[1.75]! font-semibold',
  },

  /*
   * コードブロック。本家（spec-workflow-mcp）は MDXEditor の `codeMirrorPlugin` に渡していて
   * `pre` を使わず、`div._codeMirrorWrapper_` > `div._codeMirrorToolbar_` + `.cm-editor` になる。
   * CodeMirror は持ち込まず、本家が画面に出す形（枠・行番号・折り返し）を `ProsePre` に
   * 持たせる。右上の言語名の札は `ProsePre` の外（`runtime/render/MarkdownFence.vue`）。
   *
   * 値の出どころは稼働中の本家（`/#/specs/view`）の実測と、その CSS の重ね
   * （`@mdxeditor` の `_codeMirrorWrapper_` ＋ `MDXEditorWrapper.css` のダーク時）。
   *
   * root（入れ物の `div`）が外枠: margin 16px 0 / padding .8rem / border 1px #374151 /
   * radius 8px / overflow hidden / background #1f2937。
   *
   * 行番号の桁数 `--sb-code-digits` は `MarkdownFence.vue` が行数から決めて inline で入れる。
   * 番号の欄の幅は本家の1桁で 22px（左右 8px の余白＋数字1文字。9.6px の等幅1文字は約 5.76px）。
   * 本文の左位置は 番号の欄 ＋ 折り畳みの欄 8px ＋ 区切り線 1px ＋ 行の内側 6px。
   * 折り畳みは編集の仕掛けなので中身は持たないが、幅は空けて同じ位置に本文を置く。
   */
  pre: {
    slots: {
      root: 'my-4 p-[12.8px] border border-[#374151] rounded-lg overflow-hidden bg-[#1f2937] [--sb-code-gutter:calc(16px_+_var(--sb-code-digits,1)_*_5.76px)] [--sb-code-indent:calc(var(--sb-code-gutter)_+_15px)]',

      /*
       * 本文。本家の `.cm-scroller`（font-family:monospace / line-height:1.4）と
       * `.cm-content.cm-lineWrapping`（padding 4px 0 / color #e5e7eb / 折り返す）の重ね。
       * 横スクロールはさせない（本家は折り返す）。
       *
       * 左の番号の欄は本家では別の列（`.cm-gutters`）だが、行が折り返しても背景が続くように
       * 背景の帯として敷く。色は本家の `.cm-gutters`（#374151 と区切り線 #4b5563）。
       *
       * `!` は prose の `.prose :where(pre)` 一式（面・余白・角丸・字の大きさと字送り）と
       * `prose-pre:bg-*` に勝つため。
       *
       * `**:[.line]:inline` は `@nuxt/ui` の `**:[.line]:block` の打ち消し。block にすると
       * shiki が行の間に残す改行と重なり、1行おきに空行が出る。
       *
       * `[&_code]:*` はインラインコードの指定（prose の `code` と `prose-code:*`）を
       * コードブロックの中へ持ち込ませない。本家のコードブロックは 16px・等幅のまま。
       *
       * `[&_.line]:before:*` が行番号。本家の `.cm-lineNumbers .cm-gutterElement`
       * （font-size .6rem / padding 0 .5rem / 右寄せ / color #6b7280）。番号は行の内側に置いて
       * 左の余白へずらす。折り返しても番号が付くのは先頭の1行だけで、続きは本文の左端に
       * 揃う（本家の CodeMirror と同じ）。
       */
      base: 'm-0! pt-1! pb-1! pe-0.5! ps-(--sb-code-indent)! border-0 rounded-none! overflow-visible! bg-transparent! bg-[linear-gradient(to_right,#374151_0_calc(var(--sb-code-gutter)_+_8px),#4b5563_calc(var(--sb-code-gutter)_+_8px)_calc(var(--sb-code-gutter)_+_9px),transparent_calc(var(--sb-code-gutter)_+_9px))]! text-[#e5e7eb]! font-[family-name:monospace]! text-[16px]/[1.4]! whitespace-break-spaces [word-break:break-word] [counter-reset:sb-code-line] **:[.line]:inline [&_code]:p-0! [&_code]:[background:none]! [&_code]:[color:inherit]! [&_code]:[font:inherit]! [&_.line]:before:[counter-increment:sb-code-line] [&_.line]:before:content-[counter(sb-code-line)] [&_.line]:before:inline-block [&_.line]:before:box-border [&_.line]:before:w-(--sb-code-gutter) [&_.line]:before:ml-[calc(-1*var(--sb-code-indent))] [&_.line]:before:mr-[15px] [&_.line]:before:px-2 [&_.line]:before:text-[#6b7280] [&_.line]:before:text-[9.6px]/[1.4] [&_.line]:before:text-right [&_.line]:before:align-top',
    },
  },

  /*
   * 表。本家の表は prose ではなく MDXEditor の table editor（`_tableEditor_` /
   * `_leftAlignedCell_`）が描く。実測: 罫線 1px rgb(46,49,53) / セル padding 4px 8px /
   * 字 14px（prose の 0.875em）/ th は 600・白・面 #1f2937 / 縦は baseline 揃え。
   *
   * 入れ物の `div` は余白・角丸・横スクロールを持たせない。余白は表そのものが持つ（16px）。
   */
  table: {
    slots: {
      root: 'my-0 overflow-visible rounded-none',
      base: 'my-4! w-full border-collapse rounded-none',
    },
  },

  /*
   * 字の大きさと字送りは表から継ぐ（`@nuxt/ui` の `text-sm` を打ち消す）。
   *
   * **余白は `!` を付けないと prose に負ける。** prose の `:where(th)` 一式には
   * `thead th:first-child` のような子の指定があり、素のユーティリティより詳細度が高い
   * （実測: `px-2` だけでは左の余白が 0 になり、`py-1` だけでは `td` の上が 8px になる）。
   * 以前は `@layer sb-doc` が prose より後のレイヤーだったので、この手当てが要らなかった。
   */
  th: {
    base: 'px-2! py-1! rounded-none border border-[rgb(46,49,53)] bg-[#1f2937] text-left! align-baseline font-semibold text-white [font-size:inherit] [line-height:inherit]',
  },
  td: {
    base: 'px-2! py-1! rounded-none border border-[rgb(46,49,53)] text-left! align-baseline [font-size:inherit] [line-height:inherit]',
  },

  /* prose は thead と行に区切り線を足す。本家はセルの罫線で格子を引くので重ねない */
  thead: { base: 'border-0' },
  tbody: { base: 'border-0' },

  /*
   * 行。`@nuxt/ui` は表の四隅の角を丸めるので、同じ組み合わせセレクタで打ち消す
   * （詳細度が同じなので、同じ slot に書いて `tailwind-merge` に後勝ちさせる）。
   */
  tr: {
    base: 'border-0 [&:first-child>th:first-child]:rounded-none [&:first-child>th:last-child]:rounded-none [&:last-child>td:first-child]:rounded-none [&:last-child>td:last-child]:rounded-none',
  },
} as const;

/**
 * markxdown が `@nuxtjs/mdc` へ渡す設定のうち、利用側が選べる口。
 * ここに挙げた3項目だけを開ける。それ以外の mdc の設定は固定のままとする。
 */
export interface ModuleOptions {
  headings?: {
    anchorLinks?: NonNullable<MdcModuleOptions['headings']>['anchorLinks'];
  };
  rehypePlugins?: {
    'rehype-raw'?: NonNullable<MdcModuleOptions['rehypePlugins']>['rehype-raw'];
  };
  components?: Pick<NonNullable<MdcModuleOptions['components']>, 'prose' | 'map'>;
}

/**
 * markdown を扱う実体を閉じるモジュール。
 *
 * 描く・直す・位置を出す、の3つを公開する（`openspec/specs/markdown/module`）。
 * 外は `#markdown` から引く。内側のファイルを直接指す import は書かない
 * （`openspec/specs/app-structure` の「モジュールの参照は明示 import で行う」）。
 *
 * `modules/` は Nuxt が自動で読む置き場で、`nuxt.config.ts` に列挙しない。
 *
 * **`runtime/` の中は口で切る。** `components/` `composables/` のような種類での区切りにしない。
 * 種類で切ると、開くまで描くのか直すのか位置を出すのか分からず、口を細くするという
 * このモジュールの目的（`openspec/specs/markdown/module`）が構造から読めなくなる。
 * `@nuxt/ui` などが `runtime/components/` を採るのは、部品を並べること自体が仕事の
 * ライブラリだからで、ここは事情が違う。
 *
 * 名前を選べない段が1つだけある。**server 側は必ず `runtime/server/`** に置くこと。
 * Nuxt が生成する tsconfig は「モジュール配下の runtime/server」を名指しで server 文脈へ入れ、
 * それ以外の runtime 配下は catch-all で app 文脈に入る（実測 nuxt 4.5.2）。
 * 別名にすると browser 側の型で検査される。
 *
 * なお `runtime/app/` の段は要らない。ドキュメントは `app/` 相当を `runtime/app/` に置くと
 * 書いているが、上の catch-all があるため型は通り、`@nuxt/ui` / `@nuxtjs/mdc` / `@nuxt/icon`
 * のいずれも `runtime/app/` を使っていない（実測）。
 *
 * **markdown の設定はここにだけ在る。** `nuxt.config.ts` に戻さないこと
 * （`openspec/specs/markdown/module` の「markdown を扱う実体はモジュールの内側にだけ在る」）。
 *
 * **読み込み順に前提がある。** このモジュールは **`@nuxt/ui` より前**に走らなければ
 * ならない。`@nuxt/ui` は setup の時点で `hasNuxtModule('@nuxtjs/mdc')` を見て Prose 一式を
 * 登録するかどうかを決める（`@nuxt/ui/dist/module.mjs:121`）ので、こちらが先に
 * `@nuxtjs/mdc` を入れていないと Prose が1つも登録されない。
 *
 * 利用側は `modules` の並びでこれを満たす（`nuxt.config.ts` の `'./modules/markdown'` が
 * `'@nuxt/ui'` の前）。`modules/` ディレクトリの自動読み込みに任せると後回しになるので、
 * 明示して並べること。
 */
export default defineNuxtModule<ModuleOptions>({
  meta: {
    // 切り出し後の利用側設定として `configKey: 'markxdown'` を公開する。
    // stroke-board からの利用は既定値のみで、`nuxt.config.ts` に `markxdown` キーを
    // 置くことはしない。stroke-board の設定の正は
    // `docs/specs/core/settings-reference.md`（ADR 0004）で、この口はその対象外になる。
    name: 'markxdown',
    configKey: 'markxdown',
  },

  defaults: {
    // 既定では h2〜h4 に自動でアンカーリンクが付き、本家の文書表示と別物になるので切る
    headings: { anchorLinks: false },

    // **生 HTML は描かない。** MDC の既定サニタイズは属性しか落とさず、`<img>` や
    // `<script>` はタグとして残る。`rehype-raw` を切ると生 HTML が要素にならず、
    // 文書側の HTML が描かれる経路そのものが無くなる。
    // stroke-board は本家のファイルを読んで出すだけで、文書の中身を信用して実行する
    // 立場にない。
    rehypePlugins: { 'rehype-raw': false },

    // Prose コンポーネントで描く。本文の要素は `@nuxt/ui` の Prose 一式が持ち、
    // 見た目の上書きは `ui.prose.*`（`nuxt.options.appConfig.ui`）へ置く。下の setup を見ること。
    //
    // そのうえで `pre` だけ自前の受け口に差し替える。本家は mermaid のフェンスを図（SVG）に
    // しているが、shiki は生ソースのコードブロックにしてしまう。`MarkdownFence` が
    // `language` を見て mermaid だけ図へ回し、それ以外の `pre` は `ProsePre` へ委ねる。
    // 値は `resolveComponent()` で引かれるため、受け口は global に登録する必要がある。
    components: { prose: true, map: { pre: 'MarkdownFence' } },
  },

  async setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    // 外から引く口。`#markdown` の1本だけを公開する。
    // このリポジトリは auto-import に頼らず明示 import で参照する規約なので
    // （`openspec/specs/app-structure`）、alias を切って `#markdown/render/…` で引く。
    // `@nuxt/ui` も同じことをしている（`nuxt.options.alias["#ui"]`）
    nuxt.options.alias['#markdown'] = resolve('./runtime');

    // markdown の解釈。ビルド時に畳み込まれるので runtimeConfig には置けない
    await installModule('@nuxtjs/mdc', {
      // **`keepPosition` はここに置けない。** あれは `parseMarkdown` に渡す
      // `MDCParseOptions` のオプションであって、module の `ModuleOptions` ではない
      // （`dist/module.d.mts` の 63行目と 126行目）。
      // `<MDC>` の `parser-options` から渡す（`MarkdownView.vue`）。
      //
      // 置いたら型で止まる。実測（2026-08-30）: ここへ `keepPosition: true` を書いて
      // `yarn typecheck` を回すと
      // `error TS2353: Object literal may only specify known properties, and
      // 'keepPosition' does not exist in type 'Partial<ModuleOptions>'` で落ちる。
      //
      // **解析そのものを自前で組み直してはならない。** `<MDC>` の `useAsyncData` +
      // `parseMarkdown` を写して置き換えたところ、クライアントが再解析して shiki が
      // SSR と違う色を出し、ハイドレーションがずれて**アプリ全体のアイコンが消えた**
      // （実測。markdown の本文には症状が出ず、全画面のピクセル差分で見つかった）。
      // 位置を運ぶ手当ては `<MDC>` のスロットの中だけで行う。
      //
      // 踏んだら止まる。`test/modules/markdown/runtime/render/markdown-view-position.test.ts`
      // が `<MDC>` の実際に描かれたことで形を固定しており、自前の `parseMarkdown` 呼び出しへ
      // 書き換えると12本落ちる（実測 2026-08-30）。
      //
      // 位置の口の実装は `runtime/position/` が持つ。
      headings: options.headings,
      rehypePlugins: options.rehypePlugins,
      components: options.components,
    });

    // 本文の見た目。**`@nuxt/ui` と同じ置き場・同じ入れ方**にする
    // （`@nuxt/ui/dist/module.mjs:103` が `nuxt.options.appConfig.ui` へ `defu` で入れている）。
    //
    // `defu` は先に入っている値を残すので、このモジュールが `@nuxt/ui` より前に走る限り
    // ここの値が @nuxt/ui の既定に勝ち、利用側の `app.config.ts` は更に上から勝てる。
    nuxt.options.appConfig.ui = defu(nuxt.options.appConfig.ui ?? {}, { prose: PROSE_THEME });

    // **Prose の名前は `@nuxt/ui` の実体に解かせる。**
    //
    // `@nuxtjs/mdc` も `components.prose` が立つと自前の Prose 一式を登録する
    // （`@nuxtjs/mdc/dist/module.mjs:357`）。その中身は素のタグ（`ProseTable.vue` は
    // `<table><slot/></table>` だけ）で、`ui.prose.*` の theme を持たない。
    //
    // 名前がぶつかったとき Nuxt が採るのは**先に走査したディレクトリ**で、同じ priority
    // なら後から登録した側は捨てられる（`nuxt/dist/index.mjs:2600-2612`。
    // `addComponentsDir` の priority の既定は 0 —— `@nuxt/kit/dist/index.mjs:1758`）。
    // このモジュールは `@nuxt/ui` より前に走るので、何もしないと MDC の素タグが名前を取り、
    // `@nuxt/ui` の Prose と theme はどちらも効かない（実測: `.nuxt/components.d.ts` の
    // `ProsePre` / `ProseTable` が `@nuxtjs/mdc` を指す）。
    //
    // そこで MDC 側の登録だけ priority を下げる。`components:dirs` は登録順に呼ばれるので、
    // この時点で MDC の分は配列に入っており、`@nuxt/ui` の分はまだ入っていない。
    nuxt.hook('components:dirs', (dirs) => {
      for (const dir of dirs) {
        if (typeof dir === 'string') continue;
        if (typeof dir.path !== 'string') continue;
        if (!dir.path.includes('@nuxtjs/mdc') || !dir.path.endsWith('components/prose')) continue;
        dir.priority = -1;
      }
    });

    // フェンスの受け口。**global でなければならない。**
    // MDC は `components.map` の値を `resolveComponent(名前)` で引くので、
    // `app.component()` による登録が要る。global を外すと名前が解けず、
    // `<MarkdownFence>` という未知の要素がそのまま出る。
    //
    // 名前が `MarkdownPre` でないのは、`pre` が HTML のタグ名で、このモジュールにとっての
    // 役目（フェンスの振り分け）を表さないため。
    addComponent({
      name: 'MarkdownFence',
      filePath: resolve('./runtime/render/MarkdownFence.vue'),
      global: true,
    });

    // 本文の見た目。**push で後ろに足すこと。**
    // `@layer sb-doc;` の宣言が `@import "tailwindcss"`（main.css）より後に来ないと、
    // レイヤーの並びが theme → base → components → utilities → sb-doc にならず、
    // prose（utilities）に負ける
    nuxt.options.css.push(resolve('./runtime/assets/markdown.css'));
  },
});
