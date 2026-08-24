<script setup lang="ts">
// AI の問いを出し、回答を受け取る面。置かれる画面を知らない（design 決定1・決定5）。
// $fetch を持たず、props で受けて emit で返すだけ。往復は `useAgentQuestion` の側にある。
//
// 並びは `openspec/specs/agent-question` の規定どおり:
// 話題タグ → 詳細説明 → 問い本文 → 選択肢 → 自由入力欄。
import type { Answer, Question } from '#shared/stroke'

const props = defineProps<{
  question: Question | null
  waiting: boolean
  answered: number
  waitingMessage: string
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ answer: [answer: Answer] }>()

const picked = ref<string | null>(null)
const free = ref('')
const notice = ref('')

function reset(): void {
  picked.value = null
  free.value = ''
  notice.value = ''
}

// 問いが次に置き換わったら書きかけを持ち越さない
watch(() => props.question, reset)

// 開き直したときも前回の書きかけを残さない
watch(open, (opened) => {
  if (opened) reset()
})

// 選択肢と自由入力は排他。どちらか一方だけが回答になる。
function pick(label: string): void {
  picked.value = label
  free.value = ''
  notice.value = ''
}

function writeFree(value: string): void {
  free.value = value
  if (value) picked.value = null
  notice.value = ''
}

function send(): void {
  if (props.waiting) return

  const written = free.value.trim()
  if (written) {
    emit('answer', { kind: 'free', value: written })
    return
  }
  if (picked.value) {
    emit('answer', { kind: 'option', value: picked.value })
    return
  }
  // 選択も自由入力も無いときは送らず、回答が必要である旨を示す
  notice.value = '選択肢を選ぶか、自由入力に書いてください。'
}
</script>

<template>
  <!-- 答え終わるまで閉じない。ESC・背景クリック・閉じるボタンのいずれも受け付けない
       （design 決定4）。幅は画面を覆い切らない大きさに留め、背後の本文を残す。 -->
  <UModal
    v-model:open="open"
    title="AI からの質問"
    :dismissible="false"
    :close="false"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <!-- 次の問いを待つ間。答える面の中で待機を示す -->
      <WaitingIndicator v-if="props.waiting" :message="props.waitingMessage" />

      <div v-else-if="props.question">
        <!-- 何問目かは出すが、総数は出さない（AI が決めるため事前に分からない） -->
        <div class="mb-4 flex items-center justify-between">
          <span class="text-xs tabular-nums text-muted">質問 {{ props.answered + 1 }}</span>
          <span v-if="props.answered" class="text-xs text-muted">
            ここまで {{ props.answered }} 問に回答
          </span>
        </div>

        <!-- 話題タグ: その問いが何についてのものか -->
        <UBadge class="mb-3" size="lg" variant="subtle" color="neutral">
          {{ props.question.header }}
        </UBadge>

        <!-- 詳細説明: 既に確定していること、調べて分かった事実 -->
        <div class="mb-4 rounded-lg border border-default bg-elevated/50 p-3">
          <p class="mb-1 text-xs font-medium text-muted">詳細説明</p>
          <p class="whitespace-pre-wrap text-sm leading-relaxed text-toned">
            {{ props.question.detail }}
          </p>
        </div>

        <!-- 問い本文は詳細説明の下に置く -->
        <h3 class="mb-5 text-lg leading-snug font-semibold">{{ props.question.question }}</h3>

        <!-- 選択肢。各説明を添え、推奨には印を付ける -->
        <div class="space-y-2">
          <button
            v-for="option in props.question.options"
            :key="option.label"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="
              picked === option.label
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-inverted/30'
            "
            @click="pick(option.label)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ option.label }}</span>
              <UBadge v-if="option.recommended" size="sm" variant="subtle">推奨</UBadge>
            </div>
            <p class="mt-1 text-sm leading-relaxed text-toned">{{ option.description }}</p>
          </button>
        </div>

        <!-- 自由入力欄は常にある -->
        <div class="mt-4">
          <p class="mb-1 text-sm font-medium">どれでもない場合</p>
          <UTextarea
            :model-value="free"
            :rows="2"
            class="w-full"
            placeholder="自分の言葉で書く"
            @update:model-value="writeFree(String($event))"
          />
        </div>

        <p v-if="notice" class="mt-3 text-sm text-error">{{ notice }}</p>
      </div>

      <p v-else class="py-8 text-center text-sm text-muted">今は答える問いがありません。</p>
    </template>

    <template #footer>
      <span class="text-xs text-muted">答えると、AI がさらに聞いてくることがあります</span>
      <div class="flex-1" />
      <UButton :disabled="props.waiting || !props.question" @click="send">答える</UButton>
    </template>
  </UModal>
</template>
