<script setup lang="ts">
/**
 * 上層 — 通知。
 *
 * 列は プロジェクト / 種別 / 内容 / 最終更新 の4つ（specs/notification-feed）。
 * 行を選ぶと対象が開く。開くだけで、承認や却下はしない。
 */
import { computed, definePageMeta, navigateTo, useHead } from '#imports';

import { useBoardSocket } from '~/composables/useBoardSocket';
import { formatRelativeTime } from '~/composables/useRelativeTime';
import type { Notification } from '#shared/types';

definePageMeta({ layout: 'portal' });
useHead({ title: '通知 — stroke-board' });

const { notifications } = useBoardSocket();

const rows = computed(() => notifications.value);

const categoryLabel: Record<Notification['category'], string> = {
  approval: '承認',
  task: 'タスク',
};

/**
 * 行から対象を開く。飛び先は種別だけで決まる（ADR-0003 / design.md 決定9）。
 * 開いた先でスクロールもハイライトもしない。
 */
function open(notification: Notification): void {
  void navigateTo(`/projects/${notification.projectId}/${notification.target}`);
}
</script>

<template>
  <section>
    <h1 class="mb-4 text-lg font-semibold text-highlighted">通知</h1>

    <p v-if="rows.length === 0" class="text-muted" data-testid="notifications-empty">
      通知はまだありません。本家で承認依頼が出るか、タスクの状態が変わると、ここに並びます。
    </p>

    <table v-else class="w-full border-collapse text-sm" data-testid="notifications-table">
      <thead>
        <tr class="border-b border-default text-left text-muted">
          <th scope="col" class="px-3 py-2 font-medium">プロジェクト</th>
          <th scope="col" class="px-3 py-2 font-medium">種別</th>
          <th scope="col" class="px-3 py-2 font-medium">内容</th>
          <th scope="col" class="px-3 py-2 font-medium">最終更新</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          class="border-b border-default hover:bg-elevated focus-within:bg-elevated"
          data-testid="notification-row"
          :data-kind="row.kind"
          :data-target="row.target"
        >
          <td class="px-3 py-2">
            <!--
              行そのものではなくリンクにして、キーボードだけで辿って開けるようにする
              （specs/notification-feed）。
            -->
            <button
              type="button"
              class="text-left hover:text-highlighted focus-visible:outline focus-visible:outline-2"
              data-testid="notification-open"
              @click="open(row)"
            >
              {{ row.projectName }}
            </button>
          </td>
          <td class="px-3 py-2 text-muted">{{ categoryLabel[row.category] }}</td>
          <td class="px-3 py-2">
            <div class="text-highlighted">{{ row.title }}</div>
            <div class="text-muted">{{ row.subject }}</div>
          </td>
          <td class="px-3 py-2 text-muted">{{ formatRelativeTime(row.occurredAt) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
