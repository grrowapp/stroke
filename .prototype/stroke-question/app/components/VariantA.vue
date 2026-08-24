<script setup lang="ts">
// Variant A — 縦積みカード。問い→背景→選択肢→自由入力を上から1本の流れで読ませる。
import type { StrokeQuestion } from '~/data/question'
defineProps<{ q: StrokeQuestion }>()
const answer = defineModel<{ kind: 'option' | 'free'; value: string } | null>({ required: true })
const free = ref('')

function pick(label: string) {
  answer.value = { kind: 'option', value: label }
  free.value = ''
}
function writeFree(v: string) {
  free.value = v
  answer.value = v ? { kind: 'free', value: v } : null
}

// 回答を返してから次が返ってくるまでの待ち。モーダルの待機表示と同じ形にする。
const waiting = ref(false)

// 回答すると把握完了になり、AI が proposal を起こす（モックなので必ず先へ進む）
async function submit() {
  if (!answer.value) return
  waiting.value = true
  await new Promise((r) => setTimeout(r, 900))
  navigateTo('/proposal?fresh=1')
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-14 pb-40">
    <!-- 履歴: 本文の上にパンくずで置く -->
    <StrokeBreadcrumb :proposal-ready="false" class="mb-8" />

    <!-- 回答を返してから次が返るまでの待ち。モーダルの待機表示と同じ -->
    <div v-if="waiting" class="py-32 text-center text-sm text-muted">
      AI が次を考えています…
    </div>

    <template v-else>
    <p class="text-xs uppercase tracking-widest text-muted mb-3">ストローク</p>
    <h1 class="text-2xl font-semibold leading-snug mb-6">{{ q.question }}</h1>

    <div class="rounded-lg border border-default bg-elevated/50 p-4 mb-8">
      <p class="text-xs font-medium text-muted mb-2">背景</p>
      <p class="text-sm leading-relaxed text-toned">{{ q.background }}</p>
    </div>

    <div class="space-y-3">
      <button
        v-for="o in q.options"
        :key="o.label"
        type="button"
        class="w-full text-left rounded-lg border p-4 transition"
        :class="answer?.kind === 'option' && answer.value === o.label
          ? 'border-primary bg-primary/5'
          : 'border-default hover:border-inverted/30'"
        @click="pick(o.label)"
      >
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium">{{ o.label }}</span>
          <UBadge v-if="o.recommended" size="sm" variant="subtle">推奨</UBadge>
        </div>
        <p class="text-sm text-toned leading-relaxed">{{ o.detail }}</p>
        <p v-if="o.rationale" class="text-sm text-muted leading-relaxed mt-2 border-l-2 border-primary/40 pl-3">
          {{ o.rationale }}
        </p>
      </button>
    </div>

    <div class="mt-8">
      <p class="text-sm font-medium mb-2">どれでもない場合</p>
      <UTextarea
        :model-value="free"
        :rows="3"
        class="w-full"
        placeholder="自分の言葉で書く"
        @update:model-value="writeFree($event as string)"
      />
    </div>

    <UButton class="mt-6" size="lg" :disabled="!answer" @click="submit">送信</UButton>

    <p v-if="answer" class="mt-3 text-xs text-muted">
      送信すると、把握完了として AI が proposal を起こし、画面2 に移ります（モックなので必ず進みます）
    </p>
    </template>
  </div>
</template>
