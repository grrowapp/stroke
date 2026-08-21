<script setup lang="ts">
/**
 * 上層 — 通知。
 *
 * 列は プロジェクト / 種別 / 内容 / 最終更新 の4つ（specs/notification-feed）。
 * 行を選ぶと対象が開く。開くだけで、承認や却下はしない。
 *
 * 表の様式とアイコンは prototype（archive の navigation.prototype.html）に合わせる。
 */
import { computed, definePageMeta, navigateTo, useHead } from '#imports';

import SbIcon from '~/components/ui/SbIcon.vue';
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
    <h1 class="sb-page-title">通知</h1>

    <p v-if="rows.length === 0" class="sb-placeholder" data-testid="notifications-empty">
      通知はまだありません。本家で承認依頼が出るか、タスクの状態が変わると、ここに並びます。
    </p>

    <table v-else class="sb-table" data-testid="notifications-table">
      <thead>
        <tr>
          <th scope="col" class="w-44">プロジェクト</th>
          <th scope="col" class="w-24">種別</th>
          <th scope="col">内容</th>
          <th scope="col" class="w-28">最終更新</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          class="sb-row-hit"
          data-testid="notification-row"
          :data-kind="row.kind"
          :data-target="row.target"
        >
          <td>
            <!--
              行そのものではなくボタンにして、キーボードだけで辿って開けるようにする
              （specs/notification-feed）。
            -->
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-left text-[var(--text-secondary)] hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
              data-testid="notification-open"
              @click="open(row)"
            >
              <SbIcon name="folder" :size="14" />
              {{ row.projectName }}
            </button>
          </td>
          <td class="text-[var(--text-muted)]">{{ categoryLabel[row.category] }}</td>
          <td>
            <div>{{ row.title }}</div>
            <div class="text-[12px] text-[var(--text-secondary)]">{{ row.subject }}</div>
          </td>
          <td class="text-[12px] text-[var(--text-secondary)]">
            {{ formatRelativeTime(row.occurredAt) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
