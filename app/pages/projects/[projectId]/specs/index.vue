<script setup lang="ts">
/** 下層 — 仕様書の一覧。各行は仕様書ごとの URL を持つ */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useProjectId, useSpecs } from '~/composables/useProjectApi';
import { useRelativeTime } from '~/composables/useRelativeTime';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data, error } = await useSpecs(projectId);
// 最終更新の相対時刻。mount の後にだけ描く（specs/portal/relative-time）
const relativeTime = useRelativeTime();

/**
 * 本家の仕様書一覧は 名前 / 進捗 / 最終更新 の3列で、進捗はバーと `完了/全体` を並べる
 * （`SpecsPage.tsx` の `SpecTableRow`）。
 *
 * 名前の欄は2段。上段が本家の作る表示名（`displayName`。`core-structure` →
 * `Core Structure`）、下段が実体の名前（`name`）。片方だけ出していたときは本家の
 * 上段が消えていた。
 *
 * 進捗の列は**タスクが無くても畳まない**。本家は総数 0 のときバーの代わりに
 * 「タスクなし」を出して列は残す（`SpecsPage.tsx` の三項）。`taskProgress` が
 * 来ないものにも 0/0 を渡して、列そのものが消えないようにする。
 */
const items = computed(() =>
  (data.value ?? []).map((spec) => ({
    key: spec.name,
    label: spec.displayName ?? spec.name,
    detail: spec.name,
    icon: 'document' as const,
    progress: spec.taskProgress ?? { completed: 0, total: 0 },
    meta: relativeTime(spec.lastModified),
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
