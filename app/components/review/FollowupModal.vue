<script setup lang="ts">
// 差し戻しに対して AI が返してきた問い。画面2 から動かさず、ここで1問1答を繰り返す。
// 何問来るかは AI が決めるため、総数は示さない。
import type { Answer, Question } from '#shared/stroke'

const props = defineProps<{
  question: Question | null
  waiting: boolean
  answered: number
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ answer: [answer: Answer] }>()

const picked = ref<string | null>(null)
const free = ref('')

// 次の問いが同じ面に出るたび、選択と自由入力を空に戻す
watch(
  () => props.question,
  () => {
    picked.value = null
    free.value = ''
  },
)

watch(open, (v) => {
  if (!v) return
  picked.value = null
  free.value = ''
})

const answer = computed<Answer | null>(() => {
  if (free.value.trim()) return { kind: 'free', value: free.value.trim() }
  if (picked.value) return { kind: 'option', value: picked.value }
  return null
})

function pick(label: string): void {
  picked.value = label
  free.value = ''
}

function send(): void {
  if (!answer.value || props.waiting) return
  emit('answer', answer.value)
}
</script>

<template>
  <UModal v-model:open="open" title="AI からの質問" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <!-- 次の問いを待つ間。答える面の中で待機を示す -->
      <WaitingIndicator v-if="waiting" message="AI が次を考えています…" />

      <div v-else-if="question">
        <!-- 何問目かは出すが、総数は出さない（AI が決めるため事前に分からない） -->
        <div class="mb-4 flex items-center justify-between">
          <span class="text-xs tabular-nums text-muted">質問 {{ answered + 1 }}</span>
          <span v-if="answered" class="text-xs text-muted">ここまで {{ answered }} 問に回答</span>
        </div>

        <!-- 並びはストロークの問いと同じ: 話題タグ → 詳細説明 → 問い本文 → 選択肢 -->
        <UBadge class="mb-3" size="lg" variant="subtle" color="neutral">{{ question.header }}</UBadge>

        <div class="mb-4 rounded-lg border border-default bg-elevated/50 p-3">
          <p class="mb-1 text-xs font-medium text-muted">詳細説明</p>
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-toned">{{ question.detail }}</p>
        </div>

        <h3 class="mb-5 text-lg font-semibold leading-snug">{{ question.question }}</h3>

        <div class="space-y-2">
          <button
            v-for="o in question.options"
            :key="o.label"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="picked === o.label && !free.trim()
              ? 'border-primary bg-primary/5'
              : 'border-default hover:border-inverted/30'"
            @click="pick(o.label)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ o.label }}</span>
              <UBadge v-if="o.recommended" size="sm" variant="subtle">推奨</UBadge>
            </div>
            <p class="mt-1 text-sm leading-relaxed text-toned">{{ o.description }}</p>
          </button>
        </div>

        <div class="mt-4">
          <p class="mb-1 text-sm font-medium">どれでもない場合</p>
          <UTextarea v-model="free" :rows="2" class="w-full" placeholder="自分の言葉で書く" />
        </div>
      </div>

      <p v-else class="py-8 text-center text-sm text-muted">今は答える問いがありません。</p>
    </template>

    <template #footer>
      <span class="text-xs text-muted">答えると、AI がさらに聞いてくることがあります</span>
      <div class="flex-1" />
      <UButton :disabled="!answer || waiting" @click="send">答える</UButton>
    </template>
  </UModal>
</template>
