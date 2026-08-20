<script setup lang="ts">
// 履歴のパンくず。画面1 と画面2 で同じものを使う。
// 粒は通し番号（Q1, Q2, …）だけ。問いの文言を載せると幅が問いの長さに左右されるため載せない。
// proposal の初提出はマーカー行（`proposal: true`）として道に入り、番号を持たない。
// 通し番号は問い返しも含む問いの粒だけを数える（マーカーは数えない）。
import type { Stroke } from '#shared/types'

const props = withDefaults(
  defineProps<{
    /** 現在地。画面1 は次の問い、画面2 は proposal（差し戻しの問い返し待ちなら question） */
    current?: 'question' | 'proposal'
    /** 済んだストローク。パンくずの道になる */
    strokes: Stroke[]
  }>(),
  { current: 'question' },
)

/** 問いの粒だけ（マーカーを除く）。通し番号・粒開きの対象はこちら。 */
const questionStrokes = computed(() =>
  props.strokes.filter((s): s is Extract<Stroke, { proposal: false }> => !s.proposal),
)

const openIndex = ref<number | null>(null)

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? null : index
}

/** 開いている粒。閉じているときは null */
const opened = computed(() =>
  openIndex.value === null ? null : (questionStrokes.value[openIndex.value] ?? null),
)

/** その選択肢が選ばれたものか */
function isPicked(stroke: Extract<Stroke, { proposal: false }>, label: string): boolean {
  return stroke.answer.kind === 'option' && stroke.answer.value === label
}
</script>

<template>
  <div>
    <nav class="flex flex-wrap items-center gap-1 text-sm">
      <span class="rounded px-2 py-1 text-muted">概要</span>

      <template v-for="(stroke, i) in props.strokes" :key="i">
        <span class="text-muted/50">›</span>

        <!-- proposal の初提出。マーカーは番号を持たず、開かない -->
        <span
          v-if="stroke.proposal"
          class="rounded px-2 py-1 text-xs font-medium text-primary"
        >proposal</span>

        <!-- 問いの粒（問い返しも同じ形）。番号は questionStrokes 内の位置で数える -->
        <button
          v-else
          type="button"
          class="rounded px-2 py-1 tabular-nums transition"
          :class="openIndex === questionStrokes.indexOf(stroke)
            ? 'bg-primary/10 text-primary'
            : 'text-toned hover:bg-elevated'"
          @click="toggle(questionStrokes.indexOf(stroke))"
        >
          Q{{ questionStrokes.indexOf(stroke) + 1 }}
        </button>
      </template>

      <span class="text-muted/50">›</span>

      <!-- 現在地。画面1 は次の問い、画面2 は proposal（問い返し待ちなら次の問い） -->
      <span
        v-if="props.current === 'question'"
        class="rounded bg-elevated px-2 py-1 font-medium tabular-nums"
      >
        Q{{ questionStrokes.length + 1 }}
      </span>
      <span v-else class="rounded bg-elevated px-2 py-1 font-medium">proposal</span>
    </nav>

    <!-- 粒を開いたとき: その往復だけを全文で出す -->
    <div v-if="opened" class="mt-3 rounded-lg border border-default bg-elevated/50 p-4">
      <p class="mb-1 text-xs text-muted tabular-nums">
        Q{{ (openIndex ?? 0) + 1 }} · {{ opened.question.header }}
      </p>
      <p class="mb-3 text-sm leading-relaxed">{{ opened.question.question }}</p>

      <!-- そのとき提示された選択肢。選んだものが分かるようにする -->
      <ul class="mb-3 space-y-1">
        <li
          v-for="option in opened.question.options"
          :key="option.label"
          class="flex items-center gap-2 text-sm"
          :class="isPicked(opened, option.label) ? 'font-medium text-primary' : 'text-muted'"
        >
          <span class="w-4">{{ isPicked(opened, option.label) ? '●' : '○' }}</span>
          {{ option.label }}
          <UBadge v-if="option.recommended" size="sm" variant="subtle" color="neutral">
            推奨
          </UBadge>
        </li>
        <!-- 自由入力も1つの答え方として並べる -->
        <li
          class="flex items-center gap-2 text-sm"
          :class="opened.answer.kind === 'free' ? 'font-medium text-primary' : 'text-muted'"
        >
          <span class="w-4">{{ opened.answer.kind === 'free' ? '●' : '○' }}</span>
          自由入力
        </li>
      </ul>

      <p class="border-t border-default pt-3 text-sm leading-relaxed whitespace-pre-wrap">
        <span class="mr-2 text-xs text-muted">回答</span>{{ opened.answer.value }}
      </p>
    </div>
  </div>
</template>
