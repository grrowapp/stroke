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
 * 受け側（`CodeBlock`）に shiki のクラスやハイライトの指定が届かなくなるため。
 *
 * **`components/global/` に置いてあるのは名前で引かれるから。** MDC は map の値を
 * `resolveComponent(名前)` で引く（`MDCRenderer.vue`）。Nuxt が `app.component()` で
 * 登録するのは `components/global/` の分だけで、ほかは template の解決にしか使われない。
 * `components/workspace/` に置くと名前が解けず `<WorkspaceMarkdownPre>` という未知の
 * 要素がそのまま出る（実測）。振り分けた先はここから import するので置き場を問わない。
 */
import { computed, useAttrs } from 'vue';

import CodeBlock from '~/components/workspace/CodeBlock.vue';
import MermaidDiagram from '~/components/workspace/MermaidDiagram.vue';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

/** mermaid フェンスなら元ソース、そうでなければ null */
const mermaid = computed<string | null>(() =>
  attrs.language === 'mermaid' && typeof attrs.code === 'string' ? attrs.code : null,
);
</script>

<template>
  <MermaidDiagram v-if="mermaid !== null" :code="mermaid" />
  <CodeBlock v-else v-bind="$attrs"><slot /></CodeBlock>
</template>
