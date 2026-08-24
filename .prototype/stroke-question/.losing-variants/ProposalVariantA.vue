<script setup lang="ts">
// 画面2 Variant A — 本文が主、コメント一覧はその下。
// spec-workflow-mcp の既定レイアウト（本文 2/3 + コメント 1/3）を縦に畳んだ形。
import { marked } from 'marked'
import { sampleProposal, sampleProjectName } from '~/data/proposal'

const state = defineModel<Record<string, unknown>>({ required: true })
const name = ref(sampleProjectName)
const r = useProposalReview()
const html = computed(() => marked.parse(sampleProposal) as string)

watchEffect(() => {
  state.value = { name: name.value, view: r.viewMode.value, comments: r.comments.value.length }
})
</script>

<template>
  <div class="pb-32">
    <!-- ここまでの道をパンくずで見せる -->
    <div class="border-b border-default px-6 py-3">
      <div class="mx-auto max-w-5xl">
        <StrokeBreadcrumb current="proposal" />
      </div>
    </div>

    <div class="mx-auto max-w-5xl px-6 py-8">
      <!-- ビュー切替 -->
      <div class="mb-4 flex gap-1">
        <UButton
          v-for="m in (['preview', 'annotate', 'side-by-side'] as const)"
          :key="m"
          size="sm"
          :color="r.viewMode.value === m ? 'primary' : 'neutral'"
          :variant="r.viewMode.value === m ? 'solid' : 'ghost'"
          @click="r.viewMode.value = m"
        >{{ m === 'preview' ? 'プレビュー' : m === 'annotate' ? '注釈' : '左右' }}</UButton>
      </div>

      <div class="rounded-lg border border-default">
        <div v-if="r.viewMode.value === 'preview'" class="prose prose-sm dark:prose-invert max-w-none p-6" v-html="html" />
        <AnnotateSource
          v-else-if="r.viewMode.value === 'annotate'"
          :source="sampleProposal"
          :comments="r.comments.value"
          @select="r.onSelect"
          @click-mark="r.onClickMark"
        />
        <div v-else class="grid grid-cols-2 divide-x divide-default">
          <AnnotateSource
            :source="sampleProposal"
            :comments="r.comments.value"
            @select="r.onSelect"
            @click-mark="r.onClickMark"
          />
          <div class="prose prose-sm dark:prose-invert max-w-none p-4" v-html="html" />
        </div>
      </div>

      <!-- コメント一覧 -->
      <div class="mt-6 rounded-lg border border-default">
        <div class="flex items-center justify-between border-b border-default bg-elevated/60 px-4 py-3">
          <h4 class="text-sm font-medium">コメント（{{ r.comments.value.length }}）</h4>
          <UButton size="sm" @click="r.openGeneral">＋ 全体へのコメント</UButton>
        </div>
        <div class="space-y-3 p-4">
          <p v-if="!r.comments.value.length" class="py-6 text-center text-sm text-muted">
            まだコメントがありません<br>
            <span class="text-xs">注釈ビューで本文を選ぶと、その箇所にコメントを付けられます</span>
          </p>
          <CommentCard
            v-for="c in r.comments.value"
            :key="c.id"
            :comment="c"
            @edit="r.onClickMark"
            @remove="r.deleteId.value = $event"
          />
        </div>
      </div>
    </div>

    <!-- 決めるための帯 -->
    <div class="fixed inset-x-0 bottom-0 border-t border-default bg-default/95 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3 pb-20">
        <span class="whitespace-nowrap text-sm text-muted">/opt/projects/</span>
        <UInput v-model="name" class="flex-1" />
        <UButton color="neutral" variant="subtle" @click="r.sendBack">差し戻す（{{ r.comments.value.length }}）</UButton>
        <UButton @click="r.approveOpen.value = true">承認して作る</UButton>
      </div>
    </div>

    <ReviewModals :review="r" :project-name="name" />
    <PayloadPeek v-if="r.comments.value.length" :payload="r.payload.value" class="fixed left-4 top-20 max-w-sm" />
  </div>
</template>
