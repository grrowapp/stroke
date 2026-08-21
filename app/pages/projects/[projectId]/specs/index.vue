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
  <WorkspacePanel title="仕様書" subtitle="本家が持つ仕様書を読む。編集と承認の操作は置かない">
    <EmptyState v-if="error" testid="specs-error" title="取得できませんでした">
      仕様書を取得できませんでした。本家に繋がっていない可能性があります。
    </EmptyState>

    <!--
      0件でも表そのものは出す。本家は列見出しを残したうえで、その下に空の状態を足す
      （`SpecsPage.tsx` の Empty State）。表ごと消すと、何の一覧を見ているのかが消える。
    -->
    <template v-else>
      <RecordList
        :items="items"
        testid="specs-list"
        :labels="{ name: '仕様書', status: '進捗', meta: '最終更新' }"
      />
      <EmptyState v-if="items.length === 0" testid="specs-empty" title="仕様書がありません">
        本家で仕様書を作ると、ここに並びます。
      </EmptyState>
    </template>
  </WorkspacePanel>
</template>
