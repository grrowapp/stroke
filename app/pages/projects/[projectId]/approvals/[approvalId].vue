<script setup lang="ts">
/**
 * 下層 — 承認依頼1件と、その対象文書の中身。
 *
 * 対象文書はここで直せる。承認依頼が来た文書を読んで直したくなる場面はまさにこの画面で、
 * 別の画面へ移り直させない（specs/document-editing）。開いている実体は仕様書や
 * ステアリングの画面で開くものと同じファイルである。
 *
 * 承認・却下の操作はここに置かない。それは承認一覧の `ApprovalCard` が持つ。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import DocumentEditor from '~/components/workspace/DocumentEditor.vue';
import DocumentView from '~/components/workspace/DocumentView.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';
import {
  saveTargetOf,
  useApprovalContent,
  useProjectId,
  usePendingApprovals,
} from '~/composables/workspace/useProjectApi';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = useProjectId();
const approvalId = computed(() => String(route.params.approvalId ?? ''));

const { data: pending } = await usePendingApprovals(projectId);
const { data: document, refresh } = await useApprovalContent(projectId, approvalId);

const approval = computed(() =>
  (pending.value ?? []).find((item) => item.id === approvalId.value) ?? null,
);

const { upstreamConnected } = useBoardSocket();

/**
 * 対象文書の保存先。`filePath` から導く。
 *
 * 編集を許していない文書を指している承認依頼もありうる。そのときは読むだけになる。
 */
const target = computed(() =>
  approval.value === null ? null : saveTargetOf(approval.value.filePath),
);

async function save(content: string): Promise<string | null> {
  if (target.value === null) return 'この文書は編集できません。';

  const failure = await target.value.save(projectId.value, content);
  if (failure === null) await refresh();
  return failure;
}

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

  <WorkspacePanel v-else :title="approval.title" subtitle="対象文書">
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

    <!-- 承認から来た人は読んで直すために来ている。編集を1回押させない -->
    <DocumentEditor
      v-if="target !== null"
      :content="document?.content"
      :save="save"
      :can-save="upstreamConnected"
      edit-on-open
      testid="approval-document"
    />
    <DocumentView v-else :content="document?.content" missing="対象の文書を取得できませんでした。" />
  </WorkspacePanel>
</template>
