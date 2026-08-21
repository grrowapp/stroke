<script setup lang="ts">
/**
 * 下層 — 仕様書1本のタスク。タスク通知の飛び先（ADR-0003 / design.md 決定9）。
 *
 * 状態を変える操作は置かない。読むだけ（specs/project-workspace）。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import { useProjectId, useTaskProgress } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const specName = computed(() => String(route.params.specName ?? ''));

const { data: progress, error } = await useTaskProgress(projectId, specName);

/** 2.2.5 は blocked を持たない。2.2.7 で追加されたもの（ADR-0004） */
const STATUS = {
  pending: { label: '未着手', color: 'var(--status-pending)' },
  'in-progress': { label: '着手中', color: 'var(--status-in-progress)' },
  completed: { label: '完了', color: 'var(--status-success)' },
  blocked: { label: 'ブロック', color: 'var(--status-warning)' },
} as const;

function statusOf(status: string) {
  return STATUS[status as keyof typeof STATUS] ?? { label: status, color: 'var(--text-muted)' };
}
</script>

<template>
  <section>
    <div class="mb-3 flex items-center gap-2">
      <h1 class="sb-page-title mb-0">{{ specName }}</h1>
      <span v-if="progress" class="sb-chip ml-auto" data-testid="tasks-summary">
        {{ progress.completed }} / {{ progress.total }} 完了
      </span>
    </div>

    <EmptyState v-if="error" testid="tasks-error">
      タスクを取得できませんでした。対象が削除された可能性があります。
    </EmptyState>

    <table v-else-if="progress" class="sb-table" data-testid="task-table">
      <thead>
        <tr>
          <th scope="col" class="w-24">状態</th>
          <th scope="col" class="w-16">ID</th>
          <th scope="col">タスク</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="task in progress.taskList"
          :key="task.id"
          data-testid="task-row"
          :data-status="task.status"
        >
          <td>
            <span
              class="sb-chip"
              :style="{ color: statusOf(task.status).color, borderColor: statusOf(task.status).color }"
            >
              {{ statusOf(task.status).label }}
            </span>
          </td>
          <td class="font-mono text-[var(--text-muted)]">{{ task.id }}</td>
          <td>{{ task.description }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
