<script setup lang="ts">
// proposal 本文。テキストを選択すると、その箇所へのコメントを起こせる。
import { marked } from 'marked'
import type { Annotation } from '~/composables/useAnnotations'

const props = defineProps<{ source: string; comments: Annotation[] }>()
const emit = defineEmits<{ select: [quote: string] }>()

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const html = computed(() => {
  let out = marked.parse(props.source) as string
  for (const c of props.comments) {
    if (c.type !== 'selection' || !c.quote) continue
    const re = new RegExp(escapeRe(c.quote))
    out = out.replace(re, `<mark class="bg-yellow-200 dark:bg-yellow-500/40">${c.quote}</mark>`)
  }
  return out
})

function onMouseUp() {
  const text = window.getSelection()?.toString().trim()
  if (text) emit('select', text)
}
</script>

<template>
  <div
    class="prose prose-sm dark:prose-invert max-w-none selection:bg-yellow-200"
    @mouseup="onMouseUp"
    v-html="html"
  />
</template>
