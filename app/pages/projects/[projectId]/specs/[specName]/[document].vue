<script setup lang="ts">
/** 下層 — 仕様書の文書本文。URL でこの1本を直接指せる */
import { computed, createError, definePageMeta, useRoute } from '#imports';

import DocumentView from '~/components/workspace/DocumentView.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecDocuments } from '~/composables/workspace/useProjectApi';

definePageMeta({ layout: 'workspace' });

const DOCUMENTS = { requirements: '要件定義', design: '設計', tasks: 'タスク' } as const;
type DocumentKey = keyof typeof DOCUMENTS;

const route = useRoute();
const projectId = useProjectId();
const specName = computed(() => String(route.params.specName ?? ''));
const documentKey = computed(() => String(route.params.document ?? ''));

if (!(documentKey.value in DOCUMENTS)) {
  // 本家の仕様書は3本しかない。知らない名前を本家へ投げない
  throw createError({ statusCode: 404, statusMessage: 'unknown-spec-document' });
}

const { data } = await useSpecDocuments(projectId, specName);
const current = computed(() => data.value?.[documentKey.value as DocumentKey] ?? null);
</script>

<template>
  <WorkspacePanel
    :title="DOCUMENTS[documentKey as DocumentKey]"
    :subtitle="specName"
  >
    <DocumentView :content="current?.content" />
  </WorkspacePanel>
</template>
