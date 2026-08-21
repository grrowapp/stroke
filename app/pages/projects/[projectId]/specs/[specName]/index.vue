<script setup lang="ts">
/** 下層 — 仕様書1本の概要。requirements / design / tasks への入口 */
import { computed, definePageMeta, useRoute } from '#imports';

import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecDocuments } from '~/composables/workspace/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const specName = computed(() => String(route.params.specName ?? ''));

const { data } = await useSpecDocuments(projectId, specName);

/** 本家の仕様書は常にこの3本。無い文書は null で返る */
const DOCUMENTS = [
  { key: 'requirements', label: '要件定義', file: 'requirements.md' },
  { key: 'design', label: '設計', file: 'design.md' },
  { key: 'tasks', label: 'タスク', file: 'tasks.md' },
] as const;

const items = computed(() =>
  DOCUMENTS.map((document) => {
    const entry = data.value?.[document.key] ?? null;
    return {
      key: document.key,
      label: document.label,
      detail: document.file,
      icon: 'document' as const,
      badge:
        entry === null
          ? { text: '未作成', tone: 'pending' as const }
          : { text: 'あり', tone: 'success' as const },
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
  <WorkspacePanel :title="specName" subtitle="仕様書は要件定義 / 設計 / タスクの3本で固定される">
    <RecordList
      :items="items"
      testid="spec-documents"
      :labels="{ name: '文書', status: '状態', meta: '最終更新' }"
    />
  </WorkspacePanel>
</template>
