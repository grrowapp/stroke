<script setup lang="ts">
/**
 * 下層 — 仕様書1本のタスク。タスク通知の飛び先（ADR-0003 / design.md 決定9）。
 *
 * 状態を変える操作は置かない。読むだけ（specs/project-workspace）。
 *
 * 形は本家の `TasksPage.tsx` に合わせる。上に全体の進捗（見出し + 百分率 + バー）、
 * その下にタスクの表。状態は面を塗らず、8px の点の色だけで示す。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useTaskProgress } from '~/composables/workspace/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const specName = computed(() => String(route.params.specName ?? ''));

const { data: progress, error } = await useTaskProgress(projectId, specName);

/**
 * 2.2.5 は blocked を持たない。2.2.7 で追加されたもの（ADR-0004）。
 * 点の色は本家の `statusConfig` の `dotColor` をそのまま使う。
 */
const STATUS = {
  pending: { label: '未着手', dot: 'bg-gray-400' },
  'in-progress': { label: '着手中', dot: 'bg-orange-500' },
  completed: { label: '完了', dot: 'bg-green-500' },
  blocked: { label: 'ブロック', dot: 'bg-red-500' },
} as const;

function statusOf(status: string) {
  return STATUS[status as keyof typeof STATUS] ?? { label: status, dot: 'bg-gray-400' };
}

const percent = computed(() => {
  const value = progress.value;
  if (value === null || value === undefined || value.total === 0) return 0;
  return Math.round((value.completed / value.total) * 100);
});
</script>

<template>
  <WorkspacePanel :title="specName" subtitle="タスクとその状態。状態を変える操作は置かない">
    <EmptyState v-if="error" testid="tasks-error" icon="tasks" title="取得できませんでした">
      タスクを取得できませんでした。対象が削除された可能性があります。
    </EmptyState>

    <template v-else-if="progress">
      <!-- 本家は表の上に全体の進捗を置く（`tasksPage.overallProgress`） -->
      <div class="mb-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-[var(--text-primary)] font-medium">全体の進捗</h2>
          <span class="text-[var(--text-secondary)]" data-testid="tasks-summary">
            {{ progress.completed }} / {{ progress.total }} 完了（{{ percent }}%）
          </span>
        </div>
        <div class="sb-progress-track">
          <div class="sb-progress-fill" :style="{ width: `${percent}%` }" />
        </div>
      </div>

      <table class="sb-datatable" data-testid="task-table">
        <thead>
          <tr>
            <th scope="col" class="w-32">状態</th>
            <th scope="col" class="w-20">ID</th>
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
              <span class="sb-status-pill">
                <span class="sb-status-dot" :class="statusOf(task.status).dot" />
                {{ statusOf(task.status).label }}
              </span>
            </td>
            <td class="font-mono text-[var(--text-muted)]">{{ task.id }}</td>
            <td class="text-[var(--text-primary)]">{{ task.description }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </WorkspacePanel>
</template>
