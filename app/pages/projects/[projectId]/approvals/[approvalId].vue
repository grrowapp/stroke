<script setup lang="ts">
/**
 * 下層 — 承認依頼1件と、その対象文書の中身。
 *
 * 本家の承認画面と同じ3つの面を持つ（プレビュー / 注釈 / 並列表示）。指摘を付けられるのは
 * 生テキストが出ている面だけで、溜めた指摘は差し戻し（`needs-revision`）で本家へ渡る。
 * 面と指摘の扱いは `ReviewApprovalAnnotator` が持ち、ここは対象文書の取得と、
 * プレビューに何を置くかだけを決める。
 *
 * 対象文書はここで直せる。承認依頼が来た文書を読んで直したくなる場面はまさにこの画面で、
 * 別の画面へ移り直させない（specs/document-editing）。開いている実体は仕様書や
 * ステアリングの画面で開くものと同じファイルである。
 *
 * 編集はプレビューの面に置く。本家も整形して読む面（`MDXEditorWrapper`）がそのまま
 * 編集の口を兼ねており、生テキストの面は指摘を付けるためだけにある。
 *
 * 承認・却下はここに置かない。それは承認一覧の `ApprovalCard` が持つ。差し戻しだけを
 * ここに置くのは、それが運ぶ指摘がこの画面にしか無いためである。
 */
import { computed, definePageMeta, useRoute } from '#imports';

import ApprovalAnnotator from '~/components/review/ApprovalAnnotator.vue';
import DocumentEditor from '~/components/workspace/DocumentEditor.vue';
import DocumentView from '~/components/workspace/DocumentView.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import WorkspacePanel from '~/components/workspace/WorkspacePanel.vue';
import { useBoardSocket } from '~/composables/useBoardSocket';
import {
  saveTargetOf,
  useApprovalContent,
  useProjectId,
  usePendingApprovals,
} from '~/composables/useProjectApi';

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

/** 注釈のオフセットが指す生テキスト。保存されている中身そのもの */
const source = computed(() => document.value?.content ?? '');

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
        直したくなったらこの場で編集に入れる（別の画面へ移らせない）。
      -->
      <template #preview>
        <!--
          `framed` を立てるのは、本家の承認画面が注釈の面と同じく本文を
          `bg-panel border rounded-lg` の中に置くため（`ApprovalsAnnotator.tsx` の
          左列）。仕様書・ステアリングの画面はパネル1枚なので立てない。
        -->
        <DocumentEditor
          v-if="target !== null"
          :content="document?.content"
          :save="save"
          :can-save="upstreamConnected"
          framed
          testid="approval-document"
        />
        <!-- 直せない文書は読むだけ。枠は `DocumentEditor` が持つものと同じ -->
        <div v-else class="sb-panel">
          <DocumentView
            :content="document?.content"
            missing="対象の文書を取得できませんでした。"
          />
        </div>
      </template>
    </ApprovalAnnotator>
  </WorkspacePanel>
</template>
