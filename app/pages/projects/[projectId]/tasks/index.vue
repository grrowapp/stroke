<script setup lang="ts">
/** 下層 — タスクを持つ仕様書の一覧。タスクは仕様書ごとに分かれている */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import { useProjectId, useSpecs } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data } = await useSpecs(projectId);

const items = computed(() =>
  (data.value ?? [])
    .filter((spec) => spec.phases.tasks.exists)
    .map((spec) => ({
      key: spec.name,
      label: spec.name,
      chip:
        spec.taskProgress === undefined
          ? undefined
          : `${spec.taskProgress.completed} / ${spec.taskProgress.total}`,
      to: `/projects/${projectId.value}/tasks/${spec.name}`,
    })),
);
</script>

<template>
  <section>
    <h1 class="sb-page-title">タスク</h1>

    <EmptyState v-if="items.length === 0" testid="tasks-empty">
      タスクを持つ仕様書がありません。
    </EmptyState>
    <RecordList v-else :items="items" testid="tasks-list" />
  </section>
</template>
