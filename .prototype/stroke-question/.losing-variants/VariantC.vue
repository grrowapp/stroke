<script setup lang="ts">
// Variant C — 全画面フォーカス。問いだけ大きく。背景は畳んである。選択肢は横並びのタイル。
import type { StrokeQuestion } from '~/data/question'
defineProps<{ q: StrokeQuestion }>()
const answer = defineModel<{ kind: 'option' | 'free'; value: string } | null>({ required: true })
const free = ref('')
const openBackground = ref(false)
const openFree = ref(false)

function pick(label: string) {
  answer.value = { kind: 'option', value: label }
  free.value = ''
  openFree.value = false
}
function writeFree(v: string) {
  free.value = v
  answer.value = v ? { kind: 'free', value: v } : null
}
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-6 pb-40">
    <!-- 履歴: 画面上端にパンくずを1本通す -->
    <div class="fixed inset-x-0 top-0 z-20 border-b border-default bg-default/90 px-6 py-3 backdrop-blur">
      <div class="mx-auto max-w-4xl">
        <StrokeBreadcrumb />
      </div>
    </div>

    <div class="w-full max-w-4xl pt-16">
      <h1 class="text-center text-3xl font-semibold leading-relaxed mb-4">{{ q.question }}</h1>

      <div class="text-center mb-10">
        <button
          type="button"
          class="text-sm text-muted underline underline-offset-4 hover:text-toned"
          @click="openBackground = !openBackground"
        >
          {{ openBackground ? '背景を畳む' : '背景を読む' }}
        </button>
        <p v-if="openBackground" class="mt-4 text-left text-sm leading-relaxed text-toned">
          {{ q.background }}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <button
          v-for="o in q.options"
          :key="o.label"
          type="button"
          class="flex h-full flex-col rounded-xl border p-5 text-left transition"
          :class="answer?.kind === 'option' && answer.value === o.label
            ? 'border-primary bg-primary/5 ring-1 ring-primary'
            : 'border-default hover:-translate-y-0.5'"
          @click="pick(o.label)"
        >
          <div class="mb-3 flex min-h-6 items-center justify-between">
            <span class="text-lg font-semibold">{{ o.label }}</span>
            <UBadge v-if="o.recommended" size="sm">推奨</UBadge>
          </div>
          <p class="text-sm leading-relaxed text-toned">{{ o.detail }}</p>
          <p v-if="o.rationale" class="mt-auto pt-4 text-xs leading-relaxed text-muted">
            {{ o.rationale }}
          </p>
        </button>
      </div>

      <div class="mt-8 text-center">
        <button
          v-if="!openFree"
          type="button"
          class="text-sm text-muted underline underline-offset-4 hover:text-toned"
          @click="openFree = true"
        >
          どれでもない — 自分で書く
        </button>
        <UTextarea
          v-else
          :model-value="free"
          :rows="3"
          autofocus
          class="w-full"
          placeholder="自分の言葉で書く"
          @update:model-value="writeFree($event as string)"
        />
      </div>

      <div class="mt-8 text-center">
        <UButton size="xl" :disabled="!answer">送信</UButton>
      </div>
    </div>
  </div>
</template>
