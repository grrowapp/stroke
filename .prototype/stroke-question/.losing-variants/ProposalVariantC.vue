<script setup lang="ts">
// 画面2 Variant C — 本文だけを大きく読ませ、コメント面はスライドオーバーに退避。
// 読むことと直すことを時間で分ける置き方。
import { marked } from 'marked'
import { sampleProposal, sampleProjectName } from '~/data/proposal'

const state = defineModel<Record<string, unknown>>({ required: true })
const name = ref(sampleProjectName)
const r = useProposalReview()
const html = computed(() => marked.parse(sampleProposal) as string)
const panelOpen = ref(false)

watchEffect(() => {
  state.value = { name: name.value, view: r.viewMode.value, comments: r.comments.value.length }
})
</script>

<template>
  <div class="pb-40">
    <header class="sticky top-0 z-10 border-b border-default bg-default/90 backdrop-blur">
      <div class="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <StrokeBreadcrumb current="proposal" class="min-w-0" />
        <div class="flex shrink-0 items-center gap-2">
          <UButton
            size="xs"
            :color="r.viewMode.value === 'annotate' ? 'primary' : 'neutral'"
            :variant="r.viewMode.value === 'annotate' ? 'solid' : 'ghost'"
            @click="r.viewMode.value = r.viewMode.value === 'annotate' ? 'preview' : 'annotate'"
          >注釈モード</UButton>
          <UButton size="xs" color="neutral" variant="ghost" @click="panelOpen = true">
            コメント {{ r.comments.value.length }}
          </UButton>
          <UButton size="sm" @click="r.approveOpen.value = true">承認</UButton>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-3xl px-6 py-10">
      <div v-if="r.viewMode.value === 'preview'" class="prose prose-sm dark:prose-invert max-w-none" v-html="html" />
      <AnnotateSource
        v-else
        :source="sampleProposal"
        :comments="r.comments.value"
        class="rounded-lg border border-default"
        @select="r.onSelect"
        @click-mark="r.onClickMark"
      />
    </div>

    <USlideover v-model:open="panelOpen" title="コメント">
      <template #body>
        <UButton block size="sm" class="mb-4" @click="r.openGeneral">＋ 全体へのコメント</UButton>
        <p v-if="!r.comments.value.length" class="py-8 text-center text-sm text-muted">
          まだコメントがありません<br>
          <span class="text-xs">注釈モードで本文を選ぶと付けられます</span>
        </p>
        <div class="space-y-3">
          <CommentCard
            v-for="c in r.comments.value"
            :key="c.id"
            :comment="c"
            @edit="r.onClickMark"
            @remove="r.deleteId.value = $event"
          />
        </div>
        <PayloadPeek v-if="r.comments.value.length" :payload="r.payload.value" class="mt-4" />
      </template>
      <template #footer>
        <UButton block color="neutral" @click="r.sendBack">差し戻す（{{ r.comments.value.length }}）</UButton>
      </template>
    </USlideover>

    <ReviewModals :review="r" :project-name="name" />
  </div>
</template>
