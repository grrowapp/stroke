<script setup lang="ts">
/** 下層 — 仕様書の一覧。各行は仕様書ごとの URL を持つ */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecs } from '~/composables/workspace/useProjectApi';
import { formatRelativeTime } from '~/composables/shared/useRelativeTime';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data, error } = await useSpecs(projectId);

/**
 * 本家の仕様書一覧は 名前 / 進捗 / 最終更新 の3列で、進捗はバーと `完了/全体` を並べる
 * （`SpecsPage.tsx` の `SpecTableRow`）。タスクを持たない仕様書はバーを出さない。
 */
const items = computed(() =>
  (data.value ?? []).map((spec) => ({
    key: spec.name,
    label: spec.name,
    detail: spec.description,
    icon: 'document' as const,
    progress: spec.taskProgress,
    meta: formatRelativeTime(spec.lastModified),
    to: `/projects/${projectId.value}/specs/${spec.name}`,
  })),
);
</script>

<template>
  <!-- 文言は本家の日本語ロケール（`locales/ja.json` の `specsPage`）から取る。呼び名だけ Feature -->
  <WorkspacePanel title="Feature" subtitle="アクティブな要件・設計・タスク文書を表示・管理">
    <EmptyState v-if="error" testid="specs-error" title="取得できませんでした">
      Feature を取得できませんでした。本家に繋がっていない可能性があります。
    </EmptyState>

    <!--
      0件でも表そのものは出す。本家は列見出しを残したうえで、その下に空の状態を足す
      （`SpecsPage.tsx` の Empty State）。表ごと消すと、何の一覧を見ているのかが消える。
    -->
    <template v-else>
      <RecordList
        :items="items"
        testid="specs-list"
        :labels="{ name: 'Feature', status: '進捗', meta: '最終更新', actions: 'アクション' }"
      />
      <EmptyState v-if="items.length === 0" testid="specs-empty" title="Feature がありません">
        本家で Feature を作ると、ここに並びます。
      </EmptyState>
    </template>
  </WorkspacePanel>
</template>
