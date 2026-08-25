<script setup lang="ts">
/**
 * 下層 — プロジェクト概要。プロジェクトに入ったときの着地点。
 *
 * それぞれの画面に何件あるかを出す。入ってすぐ空の画面に着くと、繋がっていないのか
 * 中身が無いのかが分からない。
 *
 * 数の出し方は本家の統計カード（`DashboardStatistics.tsx` の Stats Grid）に合わせる。
 * 小さなアイコンタイル + 見出し、その下に大きな数、さらに下に説明。
 *
 * 稼働中の本家（`/#/`）で実測した1枚の中身:
 *   カード   padding 16 / 枠 1px / 角丸 8 / 面 surface-panel、格子の間 16
 *   見出し行 gap 12 / 下に 12
 *   タイル   32x32 / 角丸 6 / 面 surface-inset、絵 16x16 / 色 text-secondary
 *   見出し   12px / 500 / text-secondary
 *   数       24px / 600 / 等幅 + tabular-nums / text-primary / 下に 4
 *   説明     12px / 400 / text-muted
 *
 * 本家のタイルは無彩色（surface-inset ＋ text-secondary の絵）で、一覧の行頭タイル
 * （`.sb-icon-tile` の青）とは別物。ここは統計カードの側に合わせる。
 */
import { computed, definePageMeta, useFetch, useRoute } from '#imports';

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
            <span
              class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-inset)]"
            >
              <UIcon
                :name="`upstream:${section.icon}`"
                class="h-4 w-4 text-[var(--text-secondary)]"
              />
            </span>
            <span class="text-sm font-medium text-[var(--text-secondary)]">
              {{ section.label }}
            </span>
          </div>
          <div class="mb-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {{ section.count }}
          </div>
          <div class="text-sm text-[var(--text-muted)]">{{ section.unit }}</div>
        </NuxtLink>
      </li>
    </ul>
  </WorkspacePanel>
</template>
