<script setup lang="ts">
// 生の Markdown に注釈を付ける面。spec-workflow-mcp の annotate ビュー相当。
// 選択範囲はオフセット（start/end）で持つ。既存の注釈はクリックで編集に入る。
import type { Annotation } from '~/composables/useAnnotations'

const props = defineProps<{ source: string; comments: Annotation[] }>()
const emit = defineEmits<{
  select: [payload: { text: string; start: number; end: number }]
  clickMark: [id: string]
}>()

// 注釈をオフセット順に並べ、本文を「素の断片」と「注釈された断片」に切る
const segments = computed(() => {
  const spans = props.comments
    .filter((c) => c.type === 'selection' && c.startOffset != null && c.endOffset != null)
    .sort((a, b) => a.startOffset! - b.startOffset!)

  const out: { text: string; start: number; comment?: Annotation }[] = []
  let cursor = 0
  for (const s of spans) {
    if (s.startOffset! > cursor) {
      out.push({ text: props.source.slice(cursor, s.startOffset!), start: cursor })
    }
    out.push({ text: props.source.slice(s.startOffset!, s.endOffset!), start: s.startOffset!, comment: s })
    cursor = Math.max(cursor, s.endOffset!)
  }
  if (cursor < props.source.length) {
    out.push({ text: props.source.slice(cursor), start: cursor })
  }
  return out
})

// 選択範囲を本文全体でのオフセットに直す
function offsetOf(node: Node, offsetInNode: number): number | null {
  let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : (node as HTMLElement)
  while (el && !el.dataset?.start) el = el.parentElement
  if (!el) return null
  return Number(el.dataset.start) + offsetInNode
}

function onMouseUp() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return
  const a = offsetOf(sel.anchorNode, sel.anchorOffset)
  const b = offsetOf(sel.focusNode, sel.focusOffset)
  if (a == null || b == null) return
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  const text = props.source.slice(start, end).trim()
  if (!text) return
  emit('select', { text: props.source.slice(start, end), start, end })
  sel.removeAllRanges()
}
</script>

<template>
  <pre
    class="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed"
    @mouseup="onMouseUp"
  ><template v-for="(seg, i) in segments" :key="i"><mark
      v-if="seg.comment"
      :data-start="seg.start"
      class="cursor-pointer rounded-sm px-0.5"
      :style="{ backgroundColor: seg.comment.highlightColor?.bg, boxShadow: `inset 0 -2px 0 ${seg.comment.highlightColor?.border}` }"
      :title="seg.comment.comment"
      @click="emit('clickMark', seg.comment!.id)"
    >{{ seg.text }}</mark><span v-else :data-start="seg.start">{{ seg.text }}</span></template></pre>
</template>
