<script setup lang="ts">
/**
 * 下層 — 承認依頼1件と、その対象文書の中身。
 *
 * 本家の承認画面と同じ3つの面を持つ（プレビュー / 注釈 / 並列表示）。指摘を付けられるのは
 * 生テキストが出ている面だけで、溜めた指摘は差し戻し（`needs-revision`）で本家へ渡る。
 * 面と指摘の扱いは `ReviewApprovalAnnotator` が持ち、ここは対象文書の取得と、
 * プレビューに何を置くかだけを決める。
 *
 * **承認画面では編集しない。** 本家の承認画面（`ApprovalsAnnotator`）は読んで判断し指摘を
 * 付ける場で、編集の口を持たない（ユーザー決定 2026-09-01・specs/document-editing）。
 * 直すのはその文書自身の画面（仕様書・ステアリング）で行う。編集が無いのは承認画面だけで、
 * 仕様書・ステアリングの6本の編集は変えていない。
 *
 * 承認・却下はここに置かない。それは承認一覧の `ApprovalCard` が持つ。差し戻しだけを
 * ここに置くのは、それが運ぶ指摘がこの画面にしか無いためである。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import ApprovalAnnotator from '~/components/review/ApprovalAnnotator.vue';
import MarkdownView from '#markdown/render/MarkdownView.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useBoardSocket } from '~/composables/useBoardSocket';
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

const { upstreamConnected } = useBoardSocket();

/** 注釈のオフセットが指す生テキスト。保存されている中身そのもの */
const source = computed(() => document.value?.content ?? '');

const CATEGORY: Record<string, string> = { spec: '仕様', steering: 'ステアリング' };
</script>

<template>
  <!--
    本家は保留中のものしか返さないため、既に処理済みの承認依頼はここに来ない。
    承認されたのか却下されたのかは観測できない（docs/adr/0006）。
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

    <ApprovalAnnotator
      :source="source"
      :project-id="projectId"
      :approval-id="approvalId"
      :can-respond="upstreamConnected"
    >
      <!--
        整形して読む面。承認から来た人は読んで判断するので、開いた直後はこれが出る。
        読むだけで、編集の口は無い。
      -->
      <template #preview>
        <!--
          枠（`sb-panel`）を持つのは、本家の承認画面が注釈の面と同じく本文を
          `bg-panel border rounded-lg` の中に置くため（`ApprovalsAnnotator.tsx` の
          左列）。仕様書・ステアリングの画面はパネル1枚なので枠を重ねない。
        -->
        <div class="sb-panel" data-testid="approval-document">
          <MarkdownView :value="document?.content">
            <template #empty>
              <EmptyState testid="document-missing" title="中身がありません">
                対象の文書を取得できませんでした。
              </EmptyState>
            </template>
          </MarkdownView>
        </div>
      </template>
    </ApprovalAnnotator>
  </WorkspacePanel>
</template>
