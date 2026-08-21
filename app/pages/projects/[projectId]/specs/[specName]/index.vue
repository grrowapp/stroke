<script setup lang="ts">
/** 下層 — 仕様書1本の概要。requirements / design / tasks への入口 */
import { computed, definePageMeta, useRoute } from '#imports';

import RecordList from '~/components/workspace/RecordList.vue';
import { useProjectId, useSpecDocuments } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const specName = computed(() => String(route.params.specName ?? ''));

const { data } = await useSpecDocuments(projectId, specName);

/** 本家の仕様書は常にこの3本。無い文書は null で返る */
const DOCUMENTS = [
  { key: 'requirements', label: '要件定義' },
  { key: 'design', label: '設計' },
  { key: 'tasks', label: 'タスク' },
] as const;

const items = computed(() =>
  DOCUMENTS.map((document) => {
    const entry = data.value?.[document.key] ?? null;
    return {
      key: document.key,
      label: document.label,
      chip: entry === null ? '未作成' : 'あり',
      // 未作成の文書へはリンクを張らない。開いても中身が無い
      to:
        entry === null
          ? undefined
          : `/projects/${projectId.value}/specs/${specName.value}/${document.key}`,
    };
  }),
);
</script>

<template>
  <section>
    <h1 class="sb-page-title">{{ specName }}</h1>
    <RecordList :items="items" testid="spec-documents" />
  </section>
</template>
