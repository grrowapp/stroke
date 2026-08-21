<script setup lang="ts">
/**
 * 上層 — 通知。
 *
 * 列は プロジェクト / 種別 / 内容 / 最終更新 の4つ（specs/notification-feed）。
 * 行を選ぶと対象が開く。開くだけで、承認や却下はしない。
 *
 * 表の様式とアイコンは prototype（archive の navigation.prototype.html）に合わせる。
 */
import { computed, definePageMeta, navigateTo, useFetch, useHead, watch } from '#imports';

import SbIcon from '~/components/shared/SbIcon.vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';
import { formatRelativeTime } from '~/composables/shared/useRelativeTime';
import type { Notification, ProjectDirectoryResponse } from '#shared/types';

definePageMeta({ layout: 'portal' });
useHead({ title: '通知 — stroke-board' });

const { notifications, upstreamConnected } = useBoardSocket();

const rows = computed(() => notifications.value);

/**
 * 通知が0件のときに、今どうなっているかを出すためだけに使う。
 *
 * 通知は接続後に起きた変化しか出せない（本家は接続時に今の状態を送るだけで、それ以前に
 * 何が起きたかを送らない）。そのため起動直後の通知画面は必ず空になる。一方で承認待ちは
 * その時点で既に起きていることがある。「見に行かないと分からない」を解くのがこの
 * プロダクトの目的なので、空だからといって何も起きていないかのように見せない。
 */
const { data: directory, refresh } = await useFetch<ProjectDirectoryResponse>('/api/projects');

// 本家が戻ったら取り直す。切断中に取った値は「取れなかった」ままになっている
watch(upstreamConnected, (connected) => {
  if (connected) void refresh();
});

const pendingProjects = computed(() => {
  if (directory.value?.directory.status !== 'ok') return [];

  return directory.value.directory.projects.filter(
    (project) => (project.pendingApprovals ?? 0) > 0,
  );
});

const pendingTotal = computed(() =>
  pendingProjects.value.reduce((total, project) => total + (project.pendingApprovals ?? 0), 0),
);

const categoryLabel: Record<Notification['category'], string> = {
  approval: '承認',
  task: 'タスク',
};

/**
 * 行から対象を開く。飛び先は種別だけで決まる（ADR-0003 / design.md 決定9）。
 * 開いた先でスクロールもハイライトもしない。
 */
function open(notification: Notification): void {
  // 対象そのものの URL へ着地させる。一覧に着けてから探させない
  void navigateTo(
    `/projects/${notification.projectId}/${notification.target}/${notification.targetId}`,
  );
}
</script>

<template>
  <section>
    <h1 class="sb-page-title">通知</h1>

    <!--
      0件でも表そのものは残す。prototype の通知画面は4列の表で、表ごと消すと
      「何の一覧を見ているのか」が画面から消える。中身が無いことは表の下に出す。
    -->
    <table class="sb-table" data-testid="notifications-table">
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
          @click="open(row)"
        >
          <td>
            <!--
              行そのものではなくボタンにして、キーボードだけで辿って開けるようにする
              （specs/notification-feed）。
            -->
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-left text-[12px] text-[var(--text-secondary)] hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
              data-testid="notification-open"
              @click.stop="open(row)"
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

    <div v-if="rows.length === 0" class="mt-3" data-testid="notifications-empty">
      <!--
        通知は接続後の変化しか出せない。それを「何も起きていない」と読ませないために、
        今の承認待ちをここに出す。
      -->
      <div v-if="pendingTotal > 0" class="sb-card mb-3" data-testid="pending-now">
        <div class="text-[13px] font-semibold">
          承認待ちが {{ pendingTotal }} 件あります
        </div>
        <ul class="mt-2 space-y-1">
          <li v-for="project in pendingProjects" :key="project.workflowRootPath">
            <NuxtLink
              :to="`/projects/${project.projectId}/approvals`"
              class="sb-navitem justify-between"
              data-testid="pending-now-row"
              :data-name="project.name"
            >
              <span class="inline-flex items-center gap-1.5">
                <SbIcon name="folder" :size="14" />
                {{ project.name }}
              </span>
              <span class="sb-badge">{{ project.pendingApprovals }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>

      <p class="sb-placeholder">
        通知はまだありません。通知は stroke-board が本家に繋いだ後に起きた変化から出ます。
        本家で承認依頼が出るか、タスクの状態が変わると、ここに並びます。
      </p>
    </div>
  </section>
</template>
