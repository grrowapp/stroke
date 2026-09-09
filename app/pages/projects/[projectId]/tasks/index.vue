<script setup lang="ts">
/** 下層 — タスクを持つ仕様書の一覧。タスクは仕様書ごとに分かれている */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecs } from '~/composables/useProjectApi';
import { useRelativeTime } from '~/composables/useRelativeTime';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data } = await useSpecs(projectId);
// 最終更新の相対時刻。mount の後にだけ描く（specs/portal/relative-time）
const relativeTime = useRelativeTime();

const items = computed(() =>
  (data.value ?? [])
    .filter((spec) => spec.phases.tasks.exists)
    .map((spec) => ({
      key: spec.name,
      label: spec.name,
      icon: 'tasks' as const,
      progress: spec.taskProgress,
      meta: relativeTime(spec.lastModified),
      to: `/projects/${projectId.value}/tasks/${spec.name}`,
    })),
);
</script>

<template>
  <!-- 文言は本家の日本語ロケール（`locales/ja.json` の `tasksPage`）から取る。呼び名だけ Feature -->
  <WorkspacePanel title="タスク管理" subtitle="Feature を選択してタスクを表示・管理します">
    <!-- 0件でも表は残す（本家の Empty State と同じ扱い） -->
    <RecordList
      :items="items"
      testid="tasks-list"
      :labels="{ name: 'Feature', status: '進捗', meta: '最終更新', actions: 'アクション' }"
    />
    <EmptyState v-if="items.length === 0" testid="tasks-empty" icon="tasks" title="タスクがありません">
      タスクを持つ Feature がありません。
    </EmptyState>
  </WorkspacePanel>
</template>
