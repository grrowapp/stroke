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
    <h1 class="sb-page-title">ステアリング</h1>

    <table class="sb-table" data-testid="steering-list">
      <thead>
        <tr>
          <th scope="col">文書</th>
          <th scope="col" class="w-32">状態</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="document in documents"
          :key="document.name"
          :class="document.exists ? '' : 'sb-row-off'"
          data-testid="steering-row"
          :data-exists="document.exists"
        >
          <td class="font-mono">{{ document.label }}</td>
          <td>
            <span class="sb-chip">{{ document.exists ? 'あり' : '未作成' }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
