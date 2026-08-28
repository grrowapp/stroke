import { addComponent, createResolver, defineNuxtModule, installModule } from '@nuxt/kit';

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
export default defineNuxtModule({
  meta: {
    // `configKey` は置かない。このモジュールは設定を1つも受け取らないので、
    // 宣言すると使えない設定キーが型に生えるだけになる。値の正は
    // `docs/specs/core/settings-reference.md`（ADR 0004）で、そこに無いものは設定ではない
    name: 'stroke-board-markdown',
  },

  async setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url);

    // 外から引く口。`#markdown` の1本だけを公開する。
    // このリポジトリは auto-import に頼らず明示 import で参照する規約なので
    // （`openspec/specs/app-structure`）、alias を切って `#markdown/render/…` で引く。
    // `@nuxt/ui` も同じことをしている（`nuxt.options.alias["#ui"]`）
    nuxt.options.alias['#markdown'] = resolve('./runtime');

    // markdown の解釈。ビルド時に畳み込まれるので runtimeConfig には置けない
    await installModule('@nuxtjs/mdc', {
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
