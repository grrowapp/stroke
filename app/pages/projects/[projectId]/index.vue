<script setup lang="ts">
/**
 * 下層 — プロジェクト概要。プロジェクトに入ったときの着地点。
 *
 * それぞれの画面に何件あるかを出す。入ってすぐ空の画面に着くと、繋がっていないのか
 * 中身が無いのかが分からない。
 */
import { computed, definePageMeta, useFetch, useRoute } from '#imports';

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
    label: '仕様書',
    count: (specs.value ?? []).length,
    unit: '本',
  },
  {
    to: 'steering',
    label: 'ステアリング',
    count: steeringCount.value,
    unit: '/ 3 本',
  },
  {
    to: 'tasks',
    label: 'タスク',
    count: (specs.value ?? []).filter((spec) => spec.phases.tasks.exists).length,
    unit: '本の仕様書',
  },
  {
    to: 'approvals',
    label: '承認',
    count: (approvals.value ?? []).length,
    unit: '件が保留中',
  },
]);
</script>

<template>
  <section>
    <h1 class="sb-page-title">{{ info?.projectName ?? projectId }}</h1>

    <dl class="sb-card mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      <dt class="text-[var(--text-muted)]">プロジェクト ID</dt>
      <dd class="font-mono" data-testid="overview-project-id">{{ projectId }}</dd>
      <dt class="text-[var(--text-muted)]">パス</dt>
      <dd class="font-mono" data-testid="overview-project-path">{{ info?.projectPath ?? '—' }}</dd>
      <dt class="text-[var(--text-muted)]">本家のバージョン</dt>
      <dd class="font-mono" data-testid="overview-version">{{ info?.version ?? '—' }}</dd>
    </dl>

    <ul class="grid grid-cols-2 gap-3" data-testid="overview-sections">
      <li v-for="section in sections" :key="section.to">
        <NuxtLink
          :to="`/projects/${projectId}/${section.to}`"
          class="sb-card block hover:border-[var(--border-strong)]"
          :data-testid="`overview-${section.to}`"
        >
          <div class="text-[13px] font-semibold">{{ section.label }}</div>
          <div class="mt-1 text-[12px] text-[var(--text-muted)]">
            <span class="text-[var(--text-primary)]">{{ section.count }}</span>
            {{ section.unit }}
          </div>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
