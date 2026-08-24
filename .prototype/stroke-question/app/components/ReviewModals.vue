<script setup lang="ts">
// レビューで使うモーダル一式。レイアウトではないので variant 間で共有する。
const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>()
const projectName = defineModel<string>('projectName', { required: true })
const r = props.review
</script>

<template>
  <div>
    <CommentModal
      v-model:open="r.commentModalOpen.value"
      :selected-text="r.pending.value?.text ?? ''"
      :initial-comment="r.editing.value?.comment"
      :initial-color="r.editing.value?.highlightColor"
      :is-editing="!!r.editingId.value"
      @save="r.saveComment"
    />

    <UModal v-model:open="r.generalModalOpen.value" title="全体へのコメント">
      <template #body>
        <UTextarea v-model="r.generalDraft.value" :rows="5" class="w-full" placeholder="proposal 全体について" autofocus />
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.generalModalOpen.value = false">やめる</UButton>
        <UButton :disabled="!r.generalDraft.value.trim()" @click="r.saveGeneral">付ける</UButton>
      </template>
    </UModal>

    <UModal :open="!!r.deleteId.value" title="このコメントを消す" @update:open="r.deleteId.value = null">
      <template #body>
        <p class="text-sm text-muted">消したコメントは戻せません。</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.deleteId.value = null">やめる</UButton>
        <UButton color="error" @click="r.confirmDelete">消す</UButton>
      </template>
    </UModal>

    <UModal :open="!!r.alertMessage.value" title="差し戻せません" @update:open="r.alertMessage.value = null">
      <template #body>
        <p class="text-sm">{{ r.alertMessage.value }}</p>
      </template>
      <template #footer>
        <UButton @click="r.alertMessage.value = null">分かった</UButton>
      </template>
    </UModal>

    <UModal v-model:open="r.approveOpen.value" title="承認してプロジェクトを作る">
      <template #body>
        <p class="mb-3 text-sm text-muted">承認すると元に戻せません。作られる場所を確認してください。</p>
        <div class="flex items-center gap-2">
          <span class="whitespace-nowrap font-mono text-sm text-muted">/opt/projects/</span>
          <UInput v-model="projectName" class="flex-1" />
          <span class="font-mono text-sm text-muted">/</span>
        </div>
        <p v-if="r.comments.value.length" class="mt-4 text-sm text-warning">
          コメントが {{ r.comments.value.length }} 件残っています。承認するとこのコメントは渡りません。
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.approveOpen.value = false">やめる</UButton>
        <UButton @click="r.approveOpen.value = false">作る</UButton>
      </template>
    </UModal>
  </div>
</template>
