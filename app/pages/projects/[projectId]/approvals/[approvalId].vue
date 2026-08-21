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
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useApprovalContent, useProjectId, usePendingApprovals } from '~/composables/workspace/useProjectApi';

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
  <!--
    本家は保留中のものしか返さないため、既に処理済みの承認依頼はここに来ない。
    承認されたのか却下されたのかは観測できない（docs/adr/0002）。
  -->
  <WorkspacePanel v-if="approval === null" title="承認">
    <EmptyState testid="approval-resolved" icon="check-circle" title="保留中の一覧にありません">
      この承認依頼は保留中の一覧にありません。既に処理済みの可能性があります。
    </EmptyState>
  </WorkspacePanel>

  <WorkspacePanel v-else :title="approval.title" subtitle="対象文書。承認と却下の操作は置かない">
    <template #actions>
      <span
        class="sb-status-badge sb-status-badge-info"
        data-testid="approval-category"
      >
        {{ CATEGORY[approval.category] ?? approval.category }}
      </span>
    </template>

    <p
      class="mb-4 font-mono text-[var(--text-muted)] break-all"
      data-testid="approval-meta"
    >
      {{ approval.filePath }}
    </p>

    <DocumentView :content="document?.content" missing="対象の文書を取得できませんでした。" />
  </WorkspacePanel>
</template>
