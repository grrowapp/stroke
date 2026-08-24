<script setup lang="ts">
/** 下層 — ステアリング文書の本文。URL でこの1本を直接指せる */
import { computed, createError, definePageMeta, useRoute } from '#imports';

import DocumentEditor from '~/components/workspace/DocumentEditor.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';
import { saveSteeringDocument, useProjectId, useSteeringDocument } from '~/composables/workspace/useProjectApi';
import { isSteeringName } from '~/composables/workspace/useSteeringDocuments';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const name = computed(() => String(route.params.name ?? ''));

if (!isSteeringName(name.value)) {
  // ステアリングは product / tech / structure の3本だけ
  throw createError({ statusCode: 404, statusMessage: 'unknown-steering-document' });
}

const { data, refresh } = await useSteeringDocument(projectId, name);

const { upstreamConnected } = useBoardSocket();

/**
 * 保存したら取り直す。保存した内容は画面が既に持っているが、本家が整形して返す場合に
 * 画面と本家がずれたままになるのを避ける。
 */
async function save(content: string): Promise<string | null> {
  const failure = await saveSteeringDocument(projectId.value, name.value, content);
  if (failure === null) await refresh();
  return failure;
}
</script>

<template>
  <WorkspacePanel :title="`${name}.md`" subtitle="ステアリング">
    <DocumentEditor
      :content="data?.content"
      :save="save"
      :can-save="upstreamConnected"
      testid="steering-document"
    />
  </WorkspacePanel>
</template>
