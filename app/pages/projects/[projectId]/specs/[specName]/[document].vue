<script setup lang="ts">
/** 下層 — 仕様書の文書本文。URL でこの1本を直接指せる */
import { computed, createError, definePageMeta, useRoute } from '#imports';

import DocumentEditor from '~/components/workspace/DocumentEditor.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useBoardSocket } from '~/composables/useBoardSocket';
import { saveSpecDocument, useProjectId, useSpecDocuments } from '~/composables/useProjectApi';

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

const { data, refresh } = await useSpecDocuments(projectId, specName);
const current = computed(() => data.value?.[documentKey.value as DocumentKey] ?? null);

const { upstreamConnected } = useBoardSocket();

/**
 * 保存したら取り直す。保存した内容は画面が既に持っているが、本家が整形して返す場合に
 * 画面と本家がずれたままになるのを避ける。
 */
async function save(content: string): Promise<string | null> {
  const failure = await saveSpecDocument(
    projectId.value,
    specName.value,
    documentKey.value,
    content,
  );
  if (failure === null) await refresh();
  return failure;
}
</script>

<template>
  <WorkspacePanel
    :title="DOCUMENTS[documentKey as DocumentKey]"
    :subtitle="specName"
  >
    <DocumentEditor
      :content="current?.content"
      :save="save"
      :can-save="upstreamConnected"
      testid="spec-document"
    />
  </WorkspacePanel>
</template>
