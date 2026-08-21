<script setup lang="ts">
/** 下層 — ステアリングの一覧。本家は常に3本で、一覧 API は無い */
import { computed, definePageMeta } from '#imports';

import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useProjectInfo } from '~/composables/workspace/useProjectApi';
import { formatRelativeTime } from '~/composables/shared/useRelativeTime';
import { useSteeringEntries } from '~/composables/workspace/useSteeringDocuments';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data: info } = await useProjectInfo(projectId);
const entries = useSteeringEntries(info);

/**
 * 本家は有無を緑（Available）と無彩色（Not Created）のバッジで出す
 * （`SteeringPage.tsx` の `SteeringDocumentRow`）。文言だけ日本語にする。
 */
const items = computed(() =>
  entries.value.map((entry) => ({
    key: entry.name,
    label: entry.label,
    icon: 'document' as const,
    badge: entry.exists
      ? { text: 'あり', tone: 'success' as const }
      : { text: '未作成', tone: 'pending' as const },
    /*
     * 本家のステアリング一覧は Last Modified の列を持つ（`SteeringPage.tsx`）。
     * 本家は3本すべてに同じ `steeringDocuments.lastModified` を出しており、文書ごとの
     * 時刻は持っていない。ここも同じものを使う（本家に無い粒度を作らない）。
     */
    meta:
      entry.exists && info.value?.steering.lastModified
        ? formatRelativeTime(info.value.steering.lastModified)
        : undefined,
    // 未作成の文書へはリンクを張らない
    to: entry.exists ? `/projects/${projectId.value}/steering/${entry.name}` : undefined,
  })),
);
</script>

<template>
  <WorkspacePanel
    title="ステアリング"
    subtitle="本家のステアリングは product / tech / structure の3本で固定される"
  >
    <RecordList
      :items="items"
      testid="steering-list"
      :labels="{ name: '文書', status: '状態', meta: '最終更新' }"
    />
  </WorkspacePanel>
</template>
