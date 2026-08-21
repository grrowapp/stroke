<script setup lang="ts">
/**
 * 下層 — 承認依頼1件と、その対象文書の中身。
 *
 * 承認・却下の操作は置かない。stroke-board は `.spec-workflow/` に書き込まない
 * （docs/adr/0001）。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import DocumentView from '~/components/workspace/DocumentView.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import { useApprovalContent, useProjectId, usePendingApprovals } from '~/composables/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const approvalId = computed(() => String(route.params.approvalId ?? ''));

const { data: pending } = await usePendingApprovals(projectId);
const { data: document } = await useApprovalContent(projectId, approvalId);

const approval = computed(() =>
  (pending.value ?? []).find((item) => item.id === approvalId.value) ?? null,
);

const CATEGORY: Record<string, string> = { spec: '仕様', steering: 'ステアリング' };
</script>

<template>
  <section>
    <!--
      本家は保留中のものしか返さないため、既に処理済みの承認依頼はここに来ない。
      承認されたのか却下されたのかは観測できない（docs/adr/0002）。
    -->
    <EmptyState v-if="approval === null" testid="approval-resolved">
      この承認依頼は保留中の一覧にありません。既に処理済みの可能性があります。
    </EmptyState>

    <template v-else>
      <h1 class="sb-page-title mb-2">{{ approval.title }}</h1>

      <div class="mb-3 flex items-center gap-2" data-testid="approval-meta">
        <span class="sb-chip">{{ CATEGORY[approval.category] ?? approval.category }}</span>
        <span class="font-mono text-[11px] text-[var(--text-muted)]">{{ approval.filePath }}</span>
      </div>

      <DocumentView :content="document?.content" missing="対象の文書を取得できませんでした。" />
    </template>
  </section>
</template>
