<script setup lang="ts">
/**
 * 下層（プロジェクト単位）の layout。
 *
 * 殻の中身（ヘッダー・左のナビ・本文余白）は `WorkspaceShell` が持つ。承認依頼をその場の
 * モーダルとして開く `layouts/approval.vue` と同じ殻を使うため、layout には器の違いしか
 * 残していない（change `update-ui-approval-review`）。
 */
import WorkspaceShell from '~/components/workspace/WorkspaceShell.vue';
</script>

<template>
  <WorkspaceShell>
    <slot />
  </WorkspaceShell>
</template>
