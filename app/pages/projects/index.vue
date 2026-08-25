<script setup lang="ts">
/**
 * 上層 — プロジェクト一覧。
 *
 * アクティブが上、未接続が下。未接続は選択できず、キーボードのフォーカスも受けない
 * （specs/project-directory）。
 *
 * 作成は常に押せるただのボタンで、押すとストロークの概要入力へ入る（ADR 0009・0010）。
 * 可否をサーバーに問わない。前提の欠けは概要投稿時の 503 として現れる（既存経路）。
 * 登録は中身が未決のため非活性固定にする。
 *
 * アクティブ / 未接続の区別は色ではなく、チップの文言と行の不透明度で示す
 * （ui.md の Visual Language）。アイコンと寸法は prototype に合わせる。
 */
import { computed, definePageMeta, navigateTo, useFetch, useHead } from '#imports';

import { useBoardSocket } from '~/composables/useBoardSocket';
import { formatRelativeTime } from '~/composables/useRelativeTime';
import type { ProjectDirectoryResponse, ProjectSummary } from '#shared/types';

definePageMeta({ layout: 'portal' });
useHead({ title: 'プロジェクト一覧 — stroke-board' });

const { data, status } = await useFetch<ProjectDirectoryResponse>('/api/projects');

const directory = computed(() => data.value?.directory);
const projects = computed<ProjectSummary[]>(() =>
  directory.value?.status === 'ok' ? directory.value.projects : [],
);

/** 作成の入口。ストロークの概要入力へ入る（ADR 0009） */
function startStroke(): void {
  void navigateTo('/strokes');
}

function enter(project: ProjectSummary): void {
  if (project.connection !== 'active' || project.projectId === null) return;
  // 入場先はプロジェクトの概要。いきなり空の一覧に着くと、繋がっていないのか
  // 中身が無いのかが分からない
  void navigateTo(`/projects/${project.projectId}`);
}

/**
 * 「未処理」列。
 *
 * 本家が今返している保留中の承認依頼の件数（サーバーが数えたもの）に、接続後に発生した
 * 通知の件数を足す。前者だけだと接続後のタスクの動きが出ず、後者だけだと接続直後は
 * 必ず0件になる。prototype はアクティブなプロジェクトに最初から件数を出しており、
 * それは通知だけでは説明がつかない。
 */
const { notifications } = useBoardSocket();

const notifiedCount = computed(() => {
  const counts = new Map<string, number>();

  for (const notification of notifications.value) {
    counts.set(notification.projectId, (counts.get(notification.projectId) ?? 0) + 1);
  }

  return counts;
});

/** 未接続では本家から取れないので数えられない */
function unread(project: ProjectSummary): number | null {
  if (project.projectId === null || project.pendingApprovals === null) return null;
  return project.pendingApprovals + (notifiedCount.value.get(project.projectId) ?? 0);
}
</script>

<template>
  <section>
    <div class="mb-3 flex items-center">
      <h1 class="sb-page-title mb-0">プロジェクト</h1>
      <div class="ml-auto flex gap-2">
        <!--
          登録・作成は一覧画面の操作として持つ。独立したメニュー項目にはしない。
          登録は中身が未決のため非活性固定。作成は常に押せる（ADR 0010）。
        -->
        <button
          type="button"
          disabled
          class="sb-btn"
          title="登録が何を指すか（本家への登録なのか、走査対象の親パスを足すのか）が決まっていません。"
          data-testid="register-project"
        >
          <UIcon name="sb:link" class="size-3.5 shrink-0" />
          登録
        </button>
        <button
          type="button"
          class="sb-btn sb-btn-primary"
          data-testid="create-project"
          @click="startStroke"
        >
          <UIcon name="sb:plus" class="size-3.5 shrink-0" />
          作成
        </button>
      </div>
    </div>

    <p v-if="status === 'pending'" class="sb-placeholder">読み込み中…</p>

    <p
      v-else-if="directory?.status === 'not-configured'"
      class="sb-placeholder"
      data-testid="projects-not-configured"
    >
      監視する親パスが設定されていません。<code>nuxt.config.ts</code> の
      <code>projectShareRoot</code> に、<code>.spec-workflow</code> を持つディレクトリが
      並ぶ親パスを設定してください。
    </p>

    <p
      v-else-if="directory?.status === 'scan-failed'"
      class="sb-placeholder"
      data-testid="projects-scan-failed"
    >
      親パス <code>{{ directory.parentPath }}</code> を読めませんでした（{{ directory.reason }}）。
    </p>

    <p v-else-if="projects.length === 0" class="sb-placeholder" data-testid="projects-empty">
      <code>{{ directory?.status === 'ok' ? directory.parentPath : '' }}</code>
      の直下に <code>.spec-workflow</code> を持つディレクトリがありません。
    </p>

    <template v-else>
      <table class="sb-table" data-testid="projects-table">
        <thead>
          <tr>
            <th scope="col">プロジェクト</th>
            <th scope="col" class="w-56">状態</th>
            <th scope="col" class="w-32">未処理の通知</th>
            <th scope="col" class="w-28">最終更新</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="project in projects"
            :key="project.workflowRootPath"
            :class="project.connection === 'active' ? 'sb-row-hit' : 'sb-row-off'"
            data-testid="project-row"
            :data-connection="project.connection"
            :data-name="project.name"
            @click="enter(project)"
          >
            <td>
              <!--
                未接続の行はボタンにしない。押せないだけでなくフォーカスも受けないように
                する（specs/project-directory のキーボード操作のシナリオ）。
              -->
              <button
                v-if="project.connection === 'active'"
                type="button"
                class="inline-flex items-center gap-1.5 text-left hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
                data-testid="project-enter"
                @click.stop="enter(project)"
              >
                <UIcon name="sb:folder" class="size-3.5 shrink-0" />
                {{ project.name }}
              </button>
              <span
                v-else
                class="inline-flex items-center gap-1.5"
                data-testid="project-name-disabled"
              >
                <UIcon name="sb:folder" class="size-3.5 shrink-0" />
                {{ project.name }}
              </span>
            </td>
            <td>
              <span class="inline-flex items-center gap-1.5">
                <span class="sb-chip" :class="project.connection === 'active' ? 'sb-chip-on' : ''">
                  {{ project.connection === 'active' ? 'アクティブ' : '未接続' }}
                </span>
                <!-- アクティブの実体は生きた PID。何をもってアクティブなのかを出す -->
                <span
                  v-if="project.pid !== null"
                  class="text-[12px] text-[var(--text-secondary)]"
                  data-testid="project-pid"
                >
                  PID {{ project.pid }}
                </span>
              </span>
            </td>
            <td data-testid="project-unread">
              <span v-if="(unread(project) ?? 0) > 0" class="sb-badge">{{ unread(project) }}</span>
              <span v-else class="text-[var(--text-muted)]">—</span>
            </td>
            <td class="text-[12px] text-[var(--text-secondary)]" data-testid="project-last-modified">
              {{ project.lastModified === null ? '—' : formatRelativeTime(project.lastModified) }}
            </td>
          </tr>
        </tbody>
      </table>

      <p class="mt-2 text-[12px] text-[var(--text-secondary)]">
        未接続 = MCP サーバーが繋がっていない。選択できない。
      </p>
    </template>

    <p
      v-if="directory?.status === 'ok' && !directory.registryReadable"
      class="mt-2 text-[12px] text-[var(--text-muted)]"
      data-testid="registry-unreadable"
    >
      本家のプロジェクト登録簿を読めませんでした。すべて未接続として表示しています。
    </p>
  </section>
</template>
