/**
 * `#components` の解決先（単体テスト用）。`vitest.config.ts` の alias が指す。
 *
 * **テストではないファイルが `test/` に入る唯一の例外である。** `test/` の規範は
 * 「ソースの構造をそのまま写す」だが、alias の解決先はソースに対応物を持たない。
 * 増やすときは規範の側を先に決めること。
 *
 * ここが在るのは、`modules/markdown/runtime/render/MarkdownView.vue` が
 * `#components` から `MDCRenderer` を import しており、コンポーネントそのものを
 * 検査するには specifier を解決する必要があるからである。Nuxt を立てれば本物が
 * 引けるが、`@vitest-environment nuxt` はこのリポジトリで動かない（実測。
 * `openspec/changes/adr0017-sub-create-position-port-preview/design.md` の決定4）。
 *
 * **中身は描かない。** `MarkdownView` のテストは `<MDC>` をスタブに差し替えており、
 * `MDCRenderer` はそのスロットの中にしか現れないので一度も描かれない。ここで本物を
 * 真似ると、解析（`parseMarkdown`）と色付け（shiki）を単体テストへ引き込むことになる。
 */
import { defineComponent } from 'vue';

export const MDCRenderer = defineComponent({
  name: 'MDCRenderer',
  render: () => null,
});
