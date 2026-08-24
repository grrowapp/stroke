<script setup lang="ts">
// 履歴をパンくずで辿る。粒は Q1, Q2, … の番号だけ。
// 問いの見出しを入れると幅が読めず崩れるため、中身は開いたときに出す。
// 末尾は現在地。画面1では次の問い、画面2では proposal。
import { sampleHistory } from '~/data/history'

const props = withDefaults(
  defineProps<{ current?: 'question' | 'proposal'; proposalReady?: boolean }>(),
  { current: 'question', proposalReady: true },
)

const openIndex = ref<number | null>(null)

function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i
}
</script>

<template>
  <div>
    <nav class="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
      <span class="rounded px-2 py-1 text-muted">概要</span>

      <template v-for="(h, i) in sampleHistory" :key="i">
        <span class="text-muted/50">›</span>
        <button
          type="button"
          class="rounded px-2 py-1 tabular-nums transition"
          :class="openIndex === i ? 'bg-primary/10 text-primary' : 'text-toned hover:bg-elevated'"
          :title="h.question"
          @click="toggle(i)"
        >
          Q{{ i + 1 }}
        </button>
      </template>

      <!-- 画面1: 次の問いが現在地。proposal は末尾の粒として辿れる -->
      <template v-if="props.current === 'question'">
        <span class="text-muted/50">›</span>
        <span class="rounded bg-elevated px-2 py-1 font-medium tabular-nums">
          Q{{ sampleHistory.length + 1 }}
        </span>
        <template v-if="props.proposalReady">
          <span class="text-muted/50">›</span>
          <NuxtLink to="/proposal?variant=B" class="rounded px-2 py-1 text-toned hover:bg-elevated">
            proposal
          </NuxtLink>
        </template>
      </template>

      <!-- 画面2: proposal が現在地。番号の粒から戻れる -->
      <template v-else>
        <span class="text-muted/50">›</span>
        <span class="rounded bg-elevated px-2 py-1 font-medium">proposal</span>
      </template>
    </nav>

    <!-- 粒を開いたとき: その往復だけを出す -->
    <div
      v-if="openIndex !== null"
      class="mt-3 rounded-lg border border-default bg-elevated/50 p-4"
    >
      <p class="mb-1 text-xs text-muted">Q{{ openIndex + 1 }}</p>
      <p class="text-sm mb-3">{{ sampleHistory[openIndex]!.question }}</p>

      <!-- そのとき出ていた選択肢。選んだものが分かるようにする -->
      <ul class="mb-3 space-y-1">
        <li
          v-for="o in sampleHistory[openIndex]!.options"
          :key="o.label"
          class="flex items-center gap-2 text-sm"
          :class="!sampleHistory[openIndex]!.free && o.label === sampleHistory[openIndex]!.answer
            ? 'text-primary font-medium'
            : 'text-muted'"
        >
          <span class="w-4">
            {{ !sampleHistory[openIndex]!.free && o.label === sampleHistory[openIndex]!.answer ? '●' : '○' }}
          </span>
          {{ o.label }}
          <UBadge v-if="o.recommended" size="sm" variant="subtle" color="neutral">推奨</UBadge>
        </li>
        <li class="flex items-center gap-2 text-sm" :class="sampleHistory[openIndex]!.free ? 'text-primary font-medium' : 'text-muted'">
          <span class="w-4">{{ sampleHistory[openIndex]!.free ? '●' : '○' }}</span>
          自由入力
        </li>
      </ul>

      <p class="border-t border-default pt-3 text-sm">
        <span class="mr-2 text-xs text-muted">回答</span>
        {{ sampleHistory[openIndex]!.answer }}
      </p>
    </div>
  </div>
</template>
