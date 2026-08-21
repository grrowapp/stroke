<script setup lang="ts">
/**
 * 下層 — タスク。タスク通知の飛び先（ADR-0003 / design.md 決定9）。
 *
 * 状態を変える操作は置かない。読むだけ（specs/project-workspace）。
 * 開いた先で対象へスクロールもハイライトもしない。
 */
import { computed, definePageMeta, ref, useFetch, useRoute } from '#imports';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { data: specs } = await useFetch(() => `/api/projects/${projectId.value}/specs`);

/** tasks.md を持つ spec だけがタスクを持つ */
const withTasks = computed(() => (specs.value ?? []).filter((spec) => spec.phases.tasks.exists));

// spec は上の await で解決済みなので、ここで同期的に初期値を決められる。
// あとから watch で入れると、URL を組み立てる時点では null のままになる
const selected = ref<string | null>(withTasks.value[0]?.name ?? null);

// URL を関数で渡すと、その中で参照している ref の変化で取り直される
const { data: progress, error } = await useFetch(
  () => `/api/projects/${projectId.value}/specs/${selected.value}/tasks`,
  { immediate: selected.value !== null },
);

/** 2.2.5 は blocked を持たない。表示できるものだけ出す（ADR-0004） */
const statusLabel: Record<string, string> = {
  pending: '未着手',
  'in-progress': '着手中',
  completed: '完了',
  blocked: 'ブロック',
};
</script>

<template>
  <section>
    <h1 class="mb-4 text-lg font-semibold text-highlighted">タスク</h1>

    <p v-if="withTasks.length === 0" class="text-muted" data-testid="tasks-empty">
      タスクを持つ仕様書がありません。
    </p>

    <template v-else>
      <div class="mb-3 flex flex-wrap gap-2" data-testid="tasks-spec-picker">
        <button
          v-for="spec in withTasks"
          :key="spec.name"
          type="button"
          class="rounded border border-default px-2 py-1 text-sm"
          :class="selected === spec.name ? 'bg-elevated text-highlighted' : 'text-muted'"
          data-testid="tasks-spec"
          @click="selected = spec.name"
        >
          {{ spec.name }}
        </button>
      </div>

      <p v-if="error" class="text-muted" data-testid="tasks-error">
        タスクを取得できませんでした。対象が削除された可能性があります。
      </p>

      <template v-else-if="progress">
        <p class="mb-3 text-sm text-muted" data-testid="tasks-summary">
          {{ progress.completed }} / {{ progress.total }} 完了
        </p>

        <ul class="space-y-1" data-testid="tasks-list">
          <li
            v-for="task in progress.taskList"
            :key="task.id"
            class="flex items-center gap-3 rounded border border-default px-3 py-2 text-sm"
            data-testid="task-row"
            :data-status="task.status"
          >
            <span class="w-20 shrink-0 text-muted">{{ statusLabel[task.status] ?? task.status }}</span>
            <span class="w-12 shrink-0 text-muted">{{ task.id }}</span>
            <span class="text-highlighted">{{ task.description }}</span>
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>
