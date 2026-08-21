<script setup lang="ts">
/**
 * 下層 — 保留中の承認依頼の一覧。承認依頼の通知の飛び先（ADR-0003）。
 *
 * 本家は保留中のものしか返さない。処理済みのものは消えているだけになる。
 */
import { computed, definePageMeta } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import RecordList from '~/components/workspace/RecordList.vue';
import { useProjectId, usePendingApprovals } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data, error } = await usePendingApprovals(projectId);

const CATEGORY: Record<string, string> = { spec: '仕様', steering: 'ステアリング' };

const items = computed(() =>
  (data.value ?? []).map((approval) => ({
    key: approval.id,
    label: approval.title,
    detail: approval.filePath,
    chip: CATEGORY[approval.category] ?? approval.category,
    to: `/projects/${projectId.value}/approvals/${approval.id}`,
  })),
);
</script>

<template>
  <section>
    <h1 class="sb-page-title">承認</h1>

    <EmptyState v-if="error" testid="approvals-error">
      承認依頼を取得できませんでした。本家に繋がっていない可能性があります。
    </EmptyState>
    <EmptyState v-else-if="items.length === 0" testid="approvals-empty">
      保留中の承認依頼はありません。処理済みのものは本家が返さないため、ここには残りません。
    </EmptyState>
    <RecordList v-else :items="items" testid="approvals-list" />
  </section>
</template>
