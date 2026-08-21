<script setup lang="ts">
/**
 * 上層 — プロジェクト一覧。
 *
 * アクティブが上、未接続が下。未接続は選択できず、キーボードのフォーカスも受けない
 * （specs/project-directory）。登録と作成は非活性の入口として置く。中身が未決なため
 * （proposal.md の「MVP から外すもの」）。
 */
import { computed, definePageMeta, navigateTo, useFetch, useHead } from '#imports';

import type { ProjectDirectory, ProjectSummary } from '#shared/types';

definePageMeta({ layout: 'portal' });
useHead({ title: 'プロジェクト一覧 — stroke-board' });

const { data, status } = await useFetch<ProjectDirectory>('/api/projects');

const directory = computed(() => data.value);
const projects = computed<ProjectSummary[]>(() =>
  directory.value?.status === 'ok' ? directory.value.projects : [],
);

function enter(project: ProjectSummary): void {
  if (project.connection !== 'active' || project.projectId === null) return;
  // 入場先は下層のサイドバーの先頭画面（specs/project-directory）
  void navigateTo(`/projects/${project.projectId}/specs`);
}
</script>

<template>
  <section>
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-highlighted">プロジェクト</h1>
      <div class="flex gap-2">
        <!--
          登録・作成は一覧画面の操作として持つ。独立したメニュー項目にはしない。
          実処理は接続先の別プロジェクトが担い、その中身が未決なので非活性のままにする。
        -->
        <button
          type="button"
          disabled
          class="rounded border border-default px-3 py-1 text-sm opacity-40 cursor-not-allowed"
          title="登録の実処理は未実装です"
          data-testid="register-project"
        >
          登録
        </button>
        <button
          type="button"
          disabled
          class="rounded border border-default px-3 py-1 text-sm opacity-40 cursor-not-allowed"
          title="作成の実処理は接続先の別プロジェクトが担います"
          data-testid="create-project"
        >
          作成
        </button>
      </div>
    </div>

    <p v-if="status === 'pending'" class="text-muted">読み込み中…</p>

    <p
      v-else-if="directory?.status === 'not-configured'"
      class="text-muted"
      data-testid="projects-not-configured"
    >
      監視する親パスが設定されていません。<code>NUXT_PROJECTS_PARENT_PATH</code>
      に、<code>.spec-workflow</code> を持つディレクトリが並ぶ親パスを設定してください。
    </p>

    <p
      v-else-if="directory?.status === 'scan-failed'"
      class="text-muted"
      data-testid="projects-scan-failed"
    >
      親パス <code>{{ directory.parentPath }}</code> を読めませんでした（{{ directory.reason }}）。
    </p>

    <p v-else-if="projects.length === 0" class="text-muted" data-testid="projects-empty">
      <code>{{ directory?.status === 'ok' ? directory.parentPath : '' }}</code>
      の直下に <code>.spec-workflow</code> を持つディレクトリがありません。
    </p>

    <table v-else class="w-full border-collapse text-sm" data-testid="projects-table">
      <thead>
        <tr class="border-b border-default text-left text-muted">
          <th scope="col" class="px-3 py-2 font-medium">プロジェクト</th>
          <th scope="col" class="px-3 py-2 font-medium">状態</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="project in projects"
          :key="project.workflowRootPath"
          class="border-b border-default"
          :class="project.connection === 'active' ? 'hover:bg-elevated' : 'opacity-40'"
          data-testid="project-row"
          :data-connection="project.connection"
          :data-name="project.name"
        >
          <td class="px-3 py-2">
            <!--
              未接続の行はボタンにしない。押せないだけでなくフォーカスも受けないようにする
              （specs/project-directory のキーボード操作のシナリオ）。
            -->
            <button
              v-if="project.connection === 'active'"
              type="button"
              class="text-left text-highlighted hover:underline focus-visible:outline focus-visible:outline-2"
              data-testid="project-enter"
              @click="enter(project)"
            >
              {{ project.name }}
            </button>
            <span v-else data-testid="project-name-disabled">{{ project.name }}</span>
          </td>
          <td class="px-3 py-2 text-muted">
            {{ project.connection === 'active' ? 'アクティブ' : '未接続' }}
          </td>
        </tr>
      </tbody>
    </table>

    <p
      v-if="directory?.status === 'ok' && !directory.registryReadable"
      class="mt-3 text-muted"
      data-testid="registry-unreadable"
    >
      本家のプロジェクト登録簿を読めませんでした。すべて未接続として表示しています。
    </p>
  </section>
</template>
