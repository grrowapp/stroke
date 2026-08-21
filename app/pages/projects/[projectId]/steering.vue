<script setup lang="ts">
/**
 * 下層 — ステアリング。product / tech / structure の3本固定。本家に一覧 API は無い。
 * 未作成の状態を出す。ここは通知の飛び先ではない（ADR-0003）。
 */
import { computed, definePageMeta, useFetch, useRoute } from '#imports';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { data: info } = await useFetch(() => `/api/projects/${projectId.value}/info`);

const documents = computed(() => {
  const present = info.value?.steering.documents;
  return [
    { name: 'product', label: 'product.md', exists: present?.product ?? false },
    { name: 'tech', label: 'tech.md', exists: present?.tech ?? false },
    { name: 'structure', label: 'structure.md', exists: present?.structure ?? false },
  ];
});
</script>

<template>
  <section>
    <h1 class="mb-4 text-lg font-semibold text-highlighted">ステアリング</h1>

    <ul class="space-y-2" data-testid="steering-list">
      <li
        v-for="document in documents"
        :key="document.name"
        class="flex items-center justify-between rounded border border-default px-3 py-2"
        data-testid="steering-row"
        :data-exists="document.exists"
      >
        <span :class="document.exists ? 'text-highlighted' : 'text-muted'">{{ document.label }}</span>
        <span class="text-sm text-muted">{{ document.exists ? 'あり' : '未作成' }}</span>
      </li>
    </ul>
  </section>
</template>
