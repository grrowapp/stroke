<script setup lang="ts">
/**
 * 即時却下の理由を求めるモーダル。本家の Reject Approval モーダルの写し。
 *
 * 文言は本家の日本語ロケール（`approvalsPage.reject` / `common.cancel`）から取る:
 * 題「承認を却下」・placeholder「却下する理由やフィードバックを入力してください...」・
 * 送るボタン「却下」・「キャンセル」。
 *
 * 送るか、やめるかのどちらかで閉じる（specs/project/ui「理由を求める入力は本文の上に
 * 重ねて出す」）。理由は本家に応答として残るため、空のままでは送れない（本家も disabled）。
 *
 * 承認一覧のカードと、対象文書を読む画面（`ApprovalAnnotator`）の両方から同じものが開く。
 * 色の選択や引用の表示を持つ `CommentModal` とは形が違うので、無理に1つにしない
 * （design 決定3 — 使わない口を持つ部品にしない）。
 */
import { ref, watch } from '#imports';

const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ submit: [reason: string] }>();

const reason = ref('');

// 開くたびに白紙から。前回の理由を残すと、別の承認依頼へ前の文が付いて飛ぶ
watch(open, (value) => {
  if (value) reason.value = '';
});

function submit(): void {
  if (!reason.value.trim()) return;
  emit('submit', reason.value);
  open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" title="承認を却下">
    <template #body>
      <div data-testid="approval-reject-form">
        <textarea
          v-model="reason"
          rows="4"
          class="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
          placeholder="却下する理由やフィードバックを入力してください..."
          data-testid="approval-reject-reason"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="ghost"
        data-testid="approval-reject-cancel"
        @click="open = false"
      >
        キャンセル
      </UButton>
      <UButton
        :disabled="!reason.trim()"
        data-testid="approval-reject-submit"
        @click="submit"
      >
        却下
      </UButton>
    </template>
  </UModal>
</template>
