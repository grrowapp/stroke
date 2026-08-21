<script setup lang="ts">
/**
 * 上層 — プロジェクト一覧。
 *
 * アクティブが上、未接続が下。未接続は選択できず、キーボードのフォーカスも受けない
 * （specs/project-directory）。登録と作成は非活性の入口として置く。中身が未決なため
 * （proposal.md の「MVP から外すもの」）。
 *
 * アクティブ / 未接続の区別は色ではなく、チップの文言と行の不透明度で示す
 * （ui.md の Visual Language）。アイコンと寸法は prototype に合わせる。
 */
import { computed, definePageMeta, navigateTo, useFetch, useHead } from '#imports';

import SbIcon from '~/components/ui/SbIcon.vue';
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
    <div class="mb-3 flex items-center">
      <h1 class="sb-page-title mb-0">プロジェクト</h1>
      <div class="ml-auto flex gap-2">
        <!--
          登録・作成は一覧画面の操作として持つ。独立したメニュー項目にはしない。
          実処理は接続先の別プロジェクトが担い、その中身が未決なので非活性のままにする。
        -->
        <button
          type="button"
          disabled
          class="sb-btn"
          title="登録の実処理は未実装です"
          data-testid="register-project"
        >
          <SbIcon name="link" :size="14" />
          登録
        </button>
        <button
          type="button"
          disabled
          class="sb-btn sb-btn-primary"
          title="作成の実処理は接続先の別プロジェクトが担います"
          data-testid="create-project"
        >
          <SbIcon name="plus" :size="14" />
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
      監視する親パスが設定されていません。<code>NUXT_PROJECTS_PARENT_PATH</code>
      に、<code>.spec-workflow</code> を持つディレクトリが並ぶ親パスを設定してください。
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
            <th scope="col" class="w-32">状態</th>
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
                @click="enter(project)"
              >
                <SbIcon name="folder" :size="14" />
                {{ project.name }}
              </button>
              <span
                v-else
                class="inline-flex items-center gap-1.5"
                data-testid="project-name-disabled"
              >
                <SbIcon name="folder" :size="14" />
                {{ project.name }}
              </span>
            </td>
            <td>
              <span class="sb-chip">
                {{ project.connection === 'active' ? 'アクティブ' : '未接続' }}
              </span>
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
