<script setup lang="ts">
/**
 * 文書の本文を出す。仕様書・ステアリング・承認対象のいずれもこれを使う。
 *
 * 読むだけ。編集も承認も置かない（specs/project-workspace）。
 */
withDefaults(
  defineProps<{ content: string | null | undefined; missing?: string }>(),
  { missing: 'この文書はまだ作られていません。' },
);
</script>

<template>
  <pre
    v-if="content"
    class="sb-card overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed"
    data-testid="document-content"
  >{{ content }}</pre>
  <p v-else class="sb-placeholder" data-testid="document-missing">{{ missing }}</p>
</template>
