<script setup lang="ts">
// 画面2 で使うモーダル一式。置き方ではないのでページから切り出す。
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
const r = props.review
</script>

<template>
  <div>
    <!-- 本文へのコメント（追加・編集） -->
    <ReviewCommentModal
      v-model:open="r.commentModalOpen.value"
      :selected-text="r.pending.value?.text ?? ''"
      :initial-comment="r.editing.value?.comment"
      :initial-color="r.editing.value?.highlightColor"
      :is-editing="!!r.editingId.value"
      @save="r.saveComment"
    />

    <!-- 全体へのコメント -->
    <UModal
      v-model:open="r.generalModalOpen.value"
      :title="r.editingGeneral.value ? '全体へのコメントを編集' : '全体へのコメント'"
    >
      <template #body>
        <UTextarea
          v-model="r.generalDraft.value"
          :rows="5"
          class="w-full"
          placeholder="proposal 全体について"
          autofocus
        />
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.closeGeneral">やめる</UButton>
        <UButton :disabled="!r.generalDraft.value.trim()" @click="r.saveGeneral">
          {{ r.editingGeneral.value ? '更新' : '付ける' }}
        </UButton>
      </template>
    </UModal>

    <!-- 削除の確認 -->
    <UModal
      :open="!!r.deleteId.value"
      title="このコメントを消す"
      @update:open="r.deleteId.value = null"
    >
      <template #body>
        <p class="text-sm text-muted">消したコメントは戻せません。</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.deleteId.value = null">やめる</UButton>
        <UButton color="error" @click="r.confirmDelete">消す</UButton>
      </template>
    </UModal>

    <!-- 止めたときの理由（コメント0件での差し戻し、409、失敗） -->
    <UModal
      :open="!!r.alertMessage.value"
      :title="r.alertTitle.value"
      @update:open="r.alertMessage.value = null"
    >
      <template #body>
        <p class="whitespace-pre-wrap text-sm">{{ r.alertMessage.value }}</p>
      </template>
      <template #footer>
        <UButton @click="r.alertMessage.value = null">分かった</UButton>
      </template>
    </UModal>

    <!-- 承認の確認。プロジェクト名はここで確定させる（常設しない） -->
    <UModal v-model:open="r.approveOpen.value" title="承認してプロジェクトを作る">
      <template #body>
        <p class="mb-3 text-sm text-muted">承認すると元に戻せません。プロジェクト名を確認してください。</p>
        <UInput v-model="r.projectName.value" class="w-full" :disabled="r.busy.value" />

        <p v-if="r.conflictName.value" class="mt-3 text-sm text-error">
          「{{ r.conflictName.value }}」は既にあります。別の名前を入れてください。
        </p>

        <p v-if="r.comments.value.length" class="mt-4 text-sm text-warning">
          コメントが {{ r.comments.value.length }} 件残っています。承認するとこのコメントは渡らずに確定します。
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" :disabled="r.busy.value" @click="r.approveOpen.value = false">
          やめる
        </UButton>
        <UButton :disabled="r.approveBlocked.value || r.busy.value" :loading="r.busy.value" @click="r.approve">
          作る
        </UButton>
      </template>
    </UModal>
  </div>
</template>
