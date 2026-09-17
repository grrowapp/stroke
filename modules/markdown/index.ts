import { addComponent, createResolver, defineNuxtModule, installModule } from '@nuxt/kit';
import type { ModuleOptions as MdcModuleOptions } from '@nuxtjs/mdc';

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
 * **読み込み順が変わっている。** Nuxt は `nuxt.config.ts` の modules を先に、`modules/`
 * の分を後に走らせる。そのため `@nuxt/ui` の setup 時点では `@nuxtjs/mdc` がまだ入って
 * おらず、`hasNuxtModule('@nuxtjs/mdc')` が偽になる（`@nuxt/ui/dist/module.mjs:121`）。
 * 結果として @nuxt/ui は Prose 一式を登録しない。
 *
 * これは害にならない。下の `components.prose: false` により MDC は Prose を引かないので、
 * 以前も登録されているだけで使われていなかった。むしろ「Tailwind クラスが `.sb-markdown`
 * に勝つ」危険そのものが無くなる。**ただし @nuxt/ui を `modules/` 側へ移すなど順序を
 * 変えると、この前提は崩れる。**
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

    // Prose コンポーネントを使わず素のタグで描く。
    // `@nuxtjs/mdc` を入れると @nuxt/ui が自前の Prose 一式（ProseTable / ProseTh …）を
    // 自動登録し（`hasNuxtModule` 判定なので `ui.prose: false` では止まらない）、
    // Tailwind クラスを直付けする。クラスは `.sb-markdown` の指定に勝つため、
    // 本家写しの見た目（docs/specs/core）が丸ごと効かなくなる。
    //
    // そのうえで `pre` だけ自前の受け口に差し替える。本家は mermaid のフェンスを図（SVG）に
    // しているが、shiki は生ソースのコードブロックにしてしまう。`MarkdownPre` が
    // `language` を見て mermaid だけ図へ回し、それ以外の `pre` は属性ごと素通しする。
    // 値は `resolveComponent()` で引かれるため、受け口は global に登録する必要がある。
    //
    // `prose` は上のとおり切ったままにする。Prose を戻すと `.sb-markdown` が効かなくなる。
    components: { prose: false, map: { pre: 'MarkdownFence' } },
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
