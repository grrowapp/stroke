<script setup lang="ts">
// 画面2 — 左に本文、右にコメントパネル常設。
// 決める操作（差し戻す・承認）はビュー切替と同じ上部固定バーに置く。
import { marked } from 'marked'
import { sampleProposal, sampleProjectName } from '~/data/proposal'


const state = defineModel<Record<string, unknown>>({ required: true })
const name = ref(sampleProjectName)
const r = useProposalReview()
const html = computed(() => marked.parse(sampleProposal) as string)

// 差し戻し後に AI が問い返してきたら、この画面の右パネルで受ける（画面1 には戻さない）。
// ?asked=1 を付ければ、差し戻しを踏まずにその状態を直接見られる。
const route = useRoute()
const askedHere = ref(route.query.asked === '1')

// 差し戻しを受けて出し直された版か / 把握完了で初めて起きた版か
const revised = ref(route.query.revised === '1')
const fresh = ref(route.query.fresh === '1')

const askModalOpen = ref(false)

function onSendBack() {
  if (!r.sendBack()) return
  askedHere.value = true
  askModalOpen.value = true
}

// 問いが尽きたら proposal が出し直される
function onAsked() {
  askedHere.value = false
  revised.value = true
  r.comments.value = []
}

watchEffect(() => {
  state.value = { name: name.value, view: r.viewMode.value, comments: r.comments.value.length }
})
</script>

<template>
  <div>
    <!-- 上部固定バー: パンくず / ビュー切替 / 差し戻す / 承認 -->
    <header class="sticky top-0 z-20 border-b border-default bg-default/95 backdrop-blur">
      <div class="flex items-center justify-between gap-4 px-6 py-3">
        <StrokeBreadcrumb current="proposal" class="min-w-0" />

        <div class="flex shrink-0 items-center gap-2">
          <div class="flex gap-1">
            <UButton
              v-for="m in (['preview', 'annotate'] as const)"
              :key="m"
              size="xs"
              :color="r.viewMode.value === m ? 'primary' : 'neutral'"
              :variant="r.viewMode.value === m ? 'solid' : 'ghost'"
              @click="r.viewMode.value = m"
            >{{ m === 'preview' ? 'プレビュー' : '注釈' }}</UButton>
          </div>

          <div class="mx-1 h-5 w-px bg-[var(--ui-border)]" />

          <UButton size="sm" color="neutral" variant="subtle" @click="onSendBack">
            差し戻す（{{ r.comments.value.length }}）
          </UButton>
          <UButton size="sm" @click="r.approveOpen.value = true">承認して作る</UButton>
        </div>
      </div>
    </header>

    <!-- 直前に何が起きてこの画面に来たか。AI からの質問だけは点滅させて目立たせる -->
    <button
      v-if="askedHere"
      type="button"
      class="blink w-full border-b border-warning bg-warning/10 px-6 py-2 text-left text-sm font-medium text-warning hover:bg-warning/20"
      @click="askModalOpen = true"
    >
      AI から質問があります。ここを押して答えてください
    </button>
    <div v-else-if="revised || fresh" class="border-b border-default bg-primary/5 px-6 py-2 text-sm text-primary">
      {{ revised
        ? '差し戻しを受けて proposal が出し直されました'
        : 'フロンティアが空になりました。AI が proposal を起こしました' }}
    </div>

    <div class="grid min-h-[calc(100vh-57px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section class="min-w-0">
        <div v-if="r.viewMode.value === 'preview'" class="prose prose-sm dark:prose-invert max-w-none px-8 py-8" v-html="html" />
        <AnnotateSource
          v-else
          :source="sampleProposal"
          :comments="r.comments.value"
          class="px-4 py-4"
          @select="r.onSelect"
          @click-mark="r.onClickMark"
        />
      </section>

      <aside class="flex flex-col border-l border-default bg-elevated/40 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)]">
        <div class="border-b border-default px-5 py-4">
          <h4 class="mb-3 text-sm font-medium">コメント（{{ r.comments.value.length }}）</h4>
          <UButton block size="sm" @click="r.openGeneral">＋ 全体へのコメント</UButton>
        </div>

        <div class="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p v-if="!r.comments.value.length" class="py-8 text-center text-sm text-muted">
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
      </aside>
    </div>

    <ReviewModals v-model:project-name="name" :review="r" />
    <FollowupModal v-model:open="askModalOpen" @done="onAsked" />
  </div>
</template>
