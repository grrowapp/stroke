<script setup lang="ts">
// 履歴のパンくず。画面1 と画面2 で同じものを使う。
// 粒は通し番号（Q1, Q2, …）だけ。問いの文言を載せると幅が問いの長さに左右されるため載せない。
// 粒を開くと、その問い・そのとき提示された選択肢・自分の回答の全文が出る。
import type { Stroke } from '#shared/types'

const props = withDefaults(
  defineProps<{
    /** 現在地。画面1 は次の問い、画面2 は proposal */
    current?: 'question' | 'proposal'
    /** 済んだストローク。パンくずの道になる */
    strokes: Stroke[]
  }>(),
  { current: 'question' },
)

const openIndex = ref<number | null>(null)

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? null : index
}

/** 開いている粒。閉じているときは null */
const opened = computed<Stroke | null>(() =>
  openIndex.value === null ? null : (props.strokes[openIndex.value] ?? null),
)

/** その選択肢が選ばれたものか */
function isPicked(stroke: Stroke, label: string): boolean {
  return stroke.answer.kind === 'option' && stroke.answer.value === label
}
</script>

<template>
  <div>
    <nav class="flex flex-wrap items-center gap-1 text-sm">
      <span class="rounded px-2 py-1 text-muted">概要</span>

      <template v-for="(stroke, i) in props.strokes" :key="i">
        <span class="text-muted/50">›</span>
        <button
          type="button"
          class="rounded px-2 py-1 tabular-nums transition"
          :class="openIndex === i ? 'bg-primary/10 text-primary' : 'text-toned hover:bg-elevated'"
          @click="toggle(i)"
        >
          Q{{ i + 1 }}
        </button>
      </template>

      <span class="text-muted/50">›</span>

      <!-- 画面1: 次の問いが現在地。proposal が起きたら画面2 へ送るので、ここに proposal は出ない -->
      <span
        v-if="props.current === 'question'"
        class="rounded bg-elevated px-2 py-1 font-medium tabular-nums"
      >
        Q{{ props.strokes.length + 1 }}
      </span>

      <!-- 画面2: proposal が現在地 -->
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
