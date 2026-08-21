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

/** 2.2.5 は blocked を持たない。2.2.7 で追加されたもの（ADR-0004） */
const statusLabel: Record<string, string> = {
  pending: '未着手',
  'in-progress': '着手中',
  completed: '完了',
  blocked: 'ブロック',
};

/** 状態の色は本家の --status-* に合わせる。ここは本家が色を撒いている数少ない場所 */
const statusColor: Record<string, string> = {
  pending: 'var(--status-pending)',
  'in-progress': 'var(--status-in-progress)',
  completed: 'var(--status-success)',
  blocked: 'var(--status-warning)',
};
</script>

<template>
  <section>
    <h1 class="mb-3 text-lg font-semibold">タスク</h1>

    <p v-if="withTasks.length === 0" class="sb-placeholder" data-testid="tasks-empty">
      タスクを持つ仕様書がありません。
    </p>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2" data-testid="tasks-spec-picker">
        <button
          v-for="spec in withTasks"
          :key="spec.name"
          type="button"
          class="sb-navitem"
          :class="selected === spec.name ? 'sb-navitem-on' : ''"
          data-testid="tasks-spec"
          @click="selected = spec.name"
        >
          {{ spec.name }}
        </button>

        <span v-if="progress" class="sb-chip ml-auto" data-testid="tasks-summary">
          {{ progress.completed }} / {{ progress.total }} 完了
        </span>
      </div>

      <p v-if="error" class="sb-placeholder" data-testid="tasks-error">
        タスクを取得できませんでした。対象が削除された可能性があります。
      </p>

      <table v-else-if="progress" class="sb-table" data-testid="tasks-list">
        <thead>
          <tr>
            <th scope="col" class="w-24">状態</th>
            <th scope="col" class="w-16">ID</th>
            <th scope="col">タスク</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in progress.taskList" :key="task.id" data-testid="task-row" :data-status="task.status">
            <td>
              <span
                class="sb-chip"
                :style="{ color: statusColor[task.status], borderColor: statusColor[task.status] }"
              >
                {{ statusLabel[task.status] ?? task.status }}
              </span>
            </td>
            <td class="font-mono text-[var(--text-muted)]">{{ task.id }}</td>
            <td>{{ task.description }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
