<script setup lang="ts">
/**
 * 下層 — プロジェクト概要。プロジェクトに入ったときの着地点。
 *
 * それぞれの画面に何件あるかを出す。入ってすぐ空の画面に着くと、繋がっていないのか
 * 中身が無いのかが分からない。
 *
 * 数の出し方は本家の統計カード（`TasksPage.tsx` の stats）に合わせる。小さなアイコン
 * タイル + 見出し、その下に大きな数、さらに下に説明。
 */
import { computed, definePageMeta, useFetch, useRoute } from '#imports';

import UpstreamIcon from '~/components/shared/UpstreamIcon.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { data: info } = await useFetch(() => `/api/projects/${projectId.value}/info`);
const { data: specs } = await useFetch(() => `/api/projects/${projectId.value}/specs`);
const { data: approvals } = await useFetch(() => `/api/projects/${projectId.value}/approvals`);

const steeringCount = computed(() => {
  const documents = info.value?.steering.documents;
  return documents === undefined
    ? 0
    : [documents.product, documents.tech, documents.structure].filter(Boolean).length;
});

const sections = computed(() => [
  {
    to: 'specs',
    label: 'Feature',
    icon: 'document' as const,
    count: (specs.value ?? []).length,
    unit: '件',
  },
  {
    to: 'steering',
    label: 'ステアリング',
    icon: 'steering' as const,
    count: steeringCount.value,
    unit: '/ 3 本',
  },
  {
    to: 'tasks',
    label: 'タスク',
    icon: 'tasks' as const,
    count: (specs.value ?? []).filter((spec) => spec.phases.tasks.exists).length,
    unit: '件の Feature',
  },
  {
    to: 'approvals',
    label: '承認',
    icon: 'check-circle' as const,
    count: (approvals.value ?? []).length,
    unit: '件が保留中',
  },
]);
</script>

<template>
  <WorkspacePanel
    :title="info?.projectName ?? projectId"
    subtitle="本家が持っているものを読むだけの画面。書き込む口はどこにも無い"
  >
    <dl
      class="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-sunken)] p-4"
    >
      <dt class="text-[var(--text-muted)]">プロジェクト ID</dt>
      <dd class="font-mono" data-testid="overview-project-id">{{ projectId }}</dd>
      <dt class="text-[var(--text-muted)]">パス</dt>
      <dd class="font-mono" data-testid="overview-project-path">{{ info?.projectPath ?? '—' }}</dd>
      <dt class="text-[var(--text-muted)]">本家のバージョン</dt>
      <dd class="font-mono" data-testid="overview-version">{{ info?.version ?? '—' }}</dd>
    </dl>

    <ul class="grid grid-cols-2 gap-4" data-testid="overview-sections">
      <li v-for="section in sections" :key="section.to">
        <NuxtLink
          :to="`/projects/${projectId}/${section.to}`"
          class="block rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)] p-4 transition-colors hover:border-[var(--border-strong)]"
          :data-testid="`overview-${section.to}`"
        >
          <div class="mb-3 flex items-center gap-3">
            <span class="sb-icon-tile !h-8 !w-8">
              <UpstreamIcon :name="section.icon" class="!h-4 !w-4" />
            </span>
            <span class="font-medium text-[var(--text-secondary)]">{{ section.label }}</span>
          </div>
          <div class="mb-1 text-xl font-semibold text-[var(--text-primary)]">
            {{ section.count }}
          </div>
          <div class="text-[var(--text-muted)]">{{ section.unit }}</div>
        </NuxtLink>
      </li>
    </ul>
  </WorkspacePanel>
</template>
