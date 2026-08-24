<script setup lang="ts">
/** 下層 — タスクを持つ仕様書の一覧。タスクは仕様書ごとに分かれている */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecs } from '~/composables/workspace/useProjectApi';
import { formatRelativeTime } from '~/composables/shared/useRelativeTime';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data } = await useSpecs(projectId);

const items = computed(() =>
  (data.value ?? [])
    .filter((spec) => spec.phases.tasks.exists)
    .map((spec) => ({
      key: spec.name,
      label: spec.name,
      icon: 'tasks' as const,
      progress: spec.taskProgress,
      meta: formatRelativeTime(spec.lastModified),
      to: `/projects/${projectId.value}/tasks/${spec.name}`,
    })),
);
</script>

<template>
  <WorkspacePanel title="タスク" subtitle="タスクを持つ Feature。状態を変える操作は置かない">
    <!-- 0件でも表は残す（本家の Empty State と同じ扱い） -->
    <RecordList
      :items="items"
      testid="tasks-list"
      :labels="{ name: 'Feature', status: '進捗', meta: '最終更新' }"
    />
    <EmptyState v-if="items.length === 0" testid="tasks-empty" icon="tasks" title="タスクがありません">
      タスクを持つ Feature がありません。
    </EmptyState>
  </WorkspacePanel>
</template>
