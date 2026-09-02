<script setup lang="ts">
/**
 * 承認依頼1件の器。承認の一覧の上に、**ルート付きのモーダル**として画面全体に出す
 * （change `update-ui-approval-review` design 決定1。`layouts/stroke.vue` に倣う）。
 *
 * - 画面全体を使う。承認の対象は仕様書や設計で長く、狭い箱に押し込めない
 * - 開閉の状態を持たない。**どの承認依頼に居るかは URL が持つ**ので、リロードすれば
 *   同じ場面が開き直り、通知からも URL で直接着地できる
 * - ストロークとの違いは**閉じられること**。承認は途中で読むのをやめてよい。Esc で閉じ、
 *   閉じたら承認の一覧へ戻す。目に見える閉じる口（「レビューを閉じる」）は決める操作の
 *   並びが持つ（design 決定2 — 本家の Close Review の位置）
 *
 * `UModal` は使わない。使うとページ全体が `role="dialog"` を持ち、この中で開く本物の
 * モーダル（コメント・即時却下の理由）と dialog が二重になる——入れ子の dialog は
 * 支援技術にも E2E（`getByRole('dialog')`）にも「どちらの話か」を曖昧にする。器は素の
 * 全画面オーバーレイで持ち、dialog の役はその場その場のモーダルだけに残す。
 *
 * 中身の殻（ヘッダー・左のナビ）は素の下層と同じ `WorkspaceShell`。本家の「その場で開く」は
 * カードの展開で、展開の中も同じ画面の続きである。器がモーダルになっても中の見えを変えない。
 */
import { useEventListener } from '@vueuse/core';
import { navigateTo, useRoute, useRouter } from '#imports';

import WorkspaceShell from '~/components/workspace/WorkspaceShell.vue';

const route = useRoute();
const router = useRouter();

/**
 * 一覧から来たときは履歴を1つ戻る（スクロール位置が保たれる）。直開きや通知からの
 * 着地では戻る先が一覧ではないので、一覧へ進む（`ApprovalAnnotator` の閉じると同じ）。
 */
function backToList(): void {
  const back = (router.options.history.state['back'] ?? null) as string | null;
  if (back !== null && back.endsWith('/approvals')) {
    router.back();
    return;
  }
  void navigateTo(`/projects/${String(route.params.projectId ?? '')}/approvals`);
}

/**
 * Esc で閉じる。ただし中でモーダル（dialog）が開いているときは、そちらの Esc が先。
 * ここでも拾うと、コメントのモーダルを閉じたつもりで一覧まで戻ってしまう。
 */
useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;
  if (document.querySelector('[role="dialog"]') !== null) return;
  backToList();
});
</script>

<template>
  <div class="fixed inset-0 z-40 overflow-y-auto bg-[var(--surface-base)]" data-testid="approval-modal">
    <WorkspaceShell>
      <slot />
    </WorkspaceShell>
  </div>
</template>
