<script setup lang="ts">
// Variant B — 左右分割。左に問いと背景を貼り付けたまま、右で選ぶ。読みながら選べる。
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
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <!-- 左: 問いと背景。スクロールしても残る -->
    <aside class="border-r border-default bg-elevated/40 px-8 py-14 lg:sticky lg:top-0 lg:h-screen">
      <p class="text-xs uppercase tracking-widest text-muted mb-3">ストローク</p>
      <h1 class="text-xl font-semibold leading-snug mb-8">{{ q.question }}</h1>
      <div class="space-y-3">
        <p class="text-xs font-medium text-muted">背景</p>
        <p class="text-sm leading-relaxed text-toned whitespace-pre-line">{{ q.background }}</p>
      </div>

      <!-- 履歴: 左カラムの下にパンくずを縦に折り返して置く -->
      <div class="mt-10 border-t border-default pt-6">
        <StrokeBreadcrumb />
      </div>
    </aside>

    <!-- 右: 選択と入力だけ -->
    <section class="px-8 py-14 pb-40">
      <table class="w-full border-separate border-spacing-y-2">
        <tbody>
          <tr
            v-for="o in q.options"
            :key="o.label"
            class="cursor-pointer align-top"
            @click="pick(o.label)"
          >
            <td
              class="w-40 rounded-l-lg border-y border-l px-4 py-4"
              :class="answer?.kind === 'option' && answer.value === o.label
                ? 'border-primary bg-primary/5'
                : 'border-default'"
            >
              <div class="font-medium">{{ o.label }}</div>
              <UBadge v-if="o.recommended" size="sm" variant="subtle" class="mt-1">推奨</UBadge>
            </td>
            <td
              class="rounded-r-lg border-y border-r px-4 py-4"
              :class="answer?.kind === 'option' && answer.value === o.label
                ? 'border-primary bg-primary/5'
                : 'border-default'"
            >
              <p class="text-sm text-toned leading-relaxed">{{ o.detail }}</p>
              <p v-if="o.rationale" class="text-sm text-muted leading-relaxed mt-2">
                根拠: {{ o.rationale }}
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-8 flex items-start gap-3">
        <UTextarea
          :model-value="free"
          :rows="2"
          class="flex-1"
          placeholder="どれでもない — 自分の言葉で書く"
          @update:model-value="writeFree($event as string)"
        />
        <UButton size="lg" :disabled="!answer">送信</UButton>
      </div>
    </section>
  </div>
</template>
