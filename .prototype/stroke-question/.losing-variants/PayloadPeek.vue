<script setup lang="ts">
// プロトタイプ用の覗き窓。AI に渡る4層をそのまま見せる。デザイン評価の対象外。
defineProps<{
  payload: {
    response: string
    annotations: string
    comments: unknown[]
    nextSteps: string[]
  }
}>()

const tab = ref<'response' | 'annotations' | 'comments' | 'nextSteps'>('response')
const tabs = [
  ['response', 'response（要約）'],
  ['nextSteps', 'nextSteps（手続き）'],
  ['comments', 'comments（構造化）'],
  ['annotations', 'annotations（JSON）'],
] as const
</script>

<template>
  <details class="rounded-lg border border-default bg-default/95 p-3 text-xs shadow-lg">
    <summary class="cursor-pointer text-muted">AI に渡るもの（4層）</summary>
    <div class="mt-2 flex flex-wrap gap-1">
      <button
        v-for="[key, label] in tabs"
        :key="key"
        class="rounded px-2 py-1"
        :class="tab === key ? 'bg-primary/15 text-primary' : 'text-muted hover:bg-elevated'"
        @click="tab = key"
      >{{ label }}</button>
    </div>
    <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{{
      tab === 'response' ? payload.response
      : tab === 'annotations' ? payload.annotations
      : tab === 'comments' ? JSON.stringify(payload.comments, null, 2)
      : payload.nextSteps.join('\n')
    }}</pre>
  </details>
</template>
