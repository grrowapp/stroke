<script setup lang="ts">
/**
 * 下層 — 保留中の承認依頼の一覧。承認依頼の通知の飛び先（ADR-0003）。
 *
 * 本家は保留中のものしか返さない。処理済みのものは消えているだけになる。
 *
 * 形は本家の `ApprovalsPage.tsx` に合わせる。他の下層画面と違い、ここは**表ではなく
 * カードの縦積み**で、上に件数を出すヘッダーのカードが載る。
 */
import { computed, definePageMeta } from '#imports';

import ApprovalCard from '~/components/workspace/ApprovalCard.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import { useProjectId, usePendingApprovals } from '~/composables/workspace/useProjectApi';

definePageMeta({ layout: 'workspace' });

const projectId = useProjectId();
const { data, error, refresh } = await usePendingApprovals(projectId);

const approvals = computed(() => data.value ?? []);

/**
 * 承認・却下したら取り直す。本家は応答すると保留中から外すので、こちらの一覧からも消える。
 * 先回りして画面から消さない（表示は本家のデータ状態から導く。ui.md の「楽観的更新は無し」）。
 */
function reload(): void {
  void refresh();
}
</script>

<template>
  <div class="grid gap-4">
    <!-- ヘッダーのカード。本家は右に「N pending」のバッジを置く。余白は実測の 12px -->
    <div class="sb-panel p-3">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0 flex-1">
          <h1 class="sb-panel-title">承認</h1>
          <p class="sb-panel-subtitle">保留中の承認依頼。承認と却下の操作は置かない</p>
        </div>
        <span
          class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
          style="background: var(--status-warning-muted); color: var(--status-warning)"
          data-testid="approvals-count"
        >
          {{ approvals.length }} 件が保留中
        </span>
      </div>
    </div>

    <div v-if="error" class="sb-panel">
      <EmptyState testid="approvals-error" title="取得できませんでした">
        承認依頼を取得できませんでした。本家に繋がっていない可能性があります。
      </EmptyState>
    </div>

    <div v-else-if="approvals.length === 0" class="sb-panel">
      <EmptyState
        testid="approvals-empty"
        icon="check-circle"
        title="保留中の承認依頼はありません"
      >
        処理済みのものは本家が返さないため、ここには残りません。
      </EmptyState>
    </div>

    <!-- 本家は space-y-3 sm:space-y-4 でカードを縦に積む -->
    <div v-else class="space-y-4" data-testid="approvals-list">
      <ApprovalCard
        v-for="approval in approvals"
        :key="approval.id"
        :approval="approval"
        :project-id="projectId"
        :to="`/projects/${projectId}/approvals/${approval.id}`"
        @responded="reload"
      />
    </div>
  </div>
</template>
