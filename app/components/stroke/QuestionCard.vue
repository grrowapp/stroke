<script setup lang="ts">
// 問いを縦積みカードで出す（ui.md 画面1 = A）。
// 問い → 背景 → 選択肢 → 自由入力 を上から1本の流れで読ませる。
// 選択肢は決定を代行する仕掛けではないため、自由入力は常に選択肢の直後に見えている。
import type { Answer, Question } from '#shared/stroke'

const props = defineProps<{ question: Question }>()
const emit = defineEmits<{ answer: [Answer] }>()

const picked = ref<string | null>(null)
const free = ref('')
const notice = ref('')

// 問いが次に置き換わったら書きかけを持ち越さない
watch(
  () => props.question,
  () => {
    picked.value = null
    free.value = ''
    notice.value = ''
  },
)

function pick(label: string) {
  picked.value = label
  free.value = ''
  notice.value = ''
}

function writeFree(value: string) {
  free.value = value
  if (value) picked.value = null
  notice.value = ''
}

function submit() {
  if (picked.value) {
    emit('answer', { kind: 'option', value: picked.value })
    return
  }
  const written = free.value.trim()
  if (written) {
    emit('answer', { kind: 'free', value: written })
    return
  }
  // 選択も自由入力も無いときは送らず、回答が必要である旨を示す
  notice.value = '選択肢を選ぶか、自由入力に書いてください。'
}
</script>

<template>
  <div>
    <p class="mb-3 text-xs tracking-widest text-muted uppercase">ストローク</p>

    <!-- 話題タグ: その問いが何についてのものか -->
    <UBadge class="mb-4" size="lg" variant="subtle" color="neutral">
      {{ props.question.header }}
    </UBadge>

    <!-- 詳細説明: 既に確定していること、調べて分かった事実 -->
    <div class="mb-6 rounded-lg border border-default bg-elevated/50 p-4">
      <p class="mb-2 text-xs font-medium text-muted">詳細説明</p>
      <p class="text-sm leading-relaxed whitespace-pre-wrap text-toned">
        {{ props.question.detail }}
      </p>
    </div>

    <!-- 問い本文は詳細説明の下に置く -->
    <h1 class="mb-8 text-2xl leading-snug font-semibold">{{ props.question.question }}</h1>

    <!-- 選択肢。各説明と、推奨にはその根拠を添える -->
    <div class="space-y-3">
      <button
        v-for="option in props.question.options"
        :key="option.label"
        type="button"
        class="w-full rounded-lg border p-4 text-left transition"
        :class="
          picked === option.label
            ? 'border-primary bg-primary/5'
            : 'border-default hover:border-inverted/30'
        "
        @click="pick(option.label)"
      >
        <div class="mb-1 flex items-center gap-2">
          <span class="font-medium">{{ option.label }}</span>
          <UBadge v-if="option.recommended" size="sm" variant="subtle">推奨</UBadge>
        </div>
        <p class="text-sm leading-relaxed text-toned">{{ option.description }}</p>
      </button>
    </div>

    <!-- 自由入力欄は常にある -->
    <div class="mt-8">
      <p class="mb-2 text-sm font-medium">どれでもない場合</p>
      <UTextarea
        :model-value="free"
        :rows="3"
        class="w-full"
        placeholder="自分の言葉で書く"
        @update:model-value="writeFree(String($event))"
      />
    </div>

    <p v-if="notice" class="mt-3 text-sm text-error">{{ notice }}</p>

    <UButton class="mt-6" size="lg" @click="submit">送信</UButton>
  </div>
</template>
