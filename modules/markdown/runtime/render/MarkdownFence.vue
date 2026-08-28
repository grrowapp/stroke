<script setup lang="ts">
/**
 * markdown のコードブロック（`pre`）の受け口。振り分けだけを持つ。
 *
 * `nuxt.config.ts` の `mdc.components.map` で `pre` をこれに差し替えている。MDC は
 * コードブロックを `<pre language="…" code="(生ソース全文)">` として渡してくるので、
 * `language` が mermaid のものは図（`MermaidDiagram`）へ、それ以外はコードブロック
 * （`CodeBlock`）へ回す。
 *
 * props を宣言せず `$attrs` で受けているのは、宣言すると属性として出なくなり、
 * 受け側（`MarkdownCode`）に shiki のクラスやハイライトの指定が届かなくなるため。
 *
 * **名前で引かれるので global に登録する。** MDC は map の値を `resolveComponent(名前)` で
 * 引く（`MDCRenderer.vue`）。名前が解けないと `<MarkdownPre>` という未知の要素がそのまま
 * 出る（実測）。以前は `app/components/global/` に置くことでこれを満たしていたが、
 * モジュールの `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無い。
 * 振り分けた先はここから相対で import する。
 */
import { computed, useAttrs } from 'vue';

import MarkdownCode from './MarkdownCode.vue';
import MarkdownDiagram from './MarkdownDiagram.vue';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

/** mermaid フェンスなら元ソース、そうでなければ null */
const mermaid = computed<string | null>(() =>
  attrs.language === 'mermaid' && typeof attrs.code === 'string' ? attrs.code : null,
);
</script>

<template>
  <MarkdownDiagram v-if="mermaid !== null" :code="mermaid" />
  <MarkdownCode v-else v-bind="$attrs"><slot /></MarkdownCode>
</template>
