<script setup lang="ts">
// 生の Markdown に注釈を付ける面。注釈を付けられるのはこの面だけ。
// 選択範囲は本文全体での文字オフセット（start / end）で持つ。
// レンダリング後の HTML ではなく生テキストに対して付けるため、
// 同じ語が本文に何度現れても、選んだ箇所だけがハイライトされる。
import type { Annotation, HighlightColor } from '#shared/types'

const props = defineProps<{ source: string; comments: Annotation[] }>()
const emit = defineEmits<{
  select: [payload: { text: string; start: number; end: number }]
  clickMark: [id: string]
}>()

interface Mark {
  id: string
  comment: string
  color: HighlightColor
}

interface Segment {
  text: string
  start: number
  /** この断片を覆うコメント。後ろほど前面（後から付けた方）。空なら素の断片 */
  marks: Mark[]
  /** 描画に使う値。marks が空なら付かない */
  paint?: {
    /** クリックで編集に入る対象。最前面のコメント */
    id: string
    title: string
    bg: string
    /** 覆っているコメントの数だけ下線を積む */
    shadow: string
  }
}

/**
 * 本文を注釈の境界で切り、各断片にそこを覆うコメントを持たせる。
 *
 * 範囲が重なっても本文はどの文字も1回だけ描かれ、`data-start` は実表示と一致する。
 * 覆っているコメントは下線を1本ずつ重ねて出すため、完全に飲み込まれた範囲も
 * 同一範囲の2件目も、必ず本文上に現れる。
 */
const segments = computed<Segment[]>(() => {
  const source = props.source
  const clamp = (n: number): number => Math.min(Math.max(n, 0), source.length)

  const selections = props.comments
    .filter((c) => c.type === 'selection')
    .map((c) => ({
      id: c.id,
      comment: c.comment,
      color: c.highlightColor,
      start: clamp(c.startOffset),
      end: clamp(c.endOffset),
    }))
    .filter((s) => s.start < s.end)

  const bounds = [...new Set([0, source.length, ...selections.flatMap((s) => [s.start, s.end])])]
    .sort((a, b) => a - b)

  const out: Segment[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]
    const to = bounds[i + 1]
    if (from === undefined || to === undefined || from >= to) continue

    // この断片を覆うコメント。配列の並びがそのまま重なりの順（後ろが前面）。
    const marks: Mark[] = selections
      .filter((s) => s.start <= from && to <= s.end)
      .map((s) => ({ id: s.id, comment: s.comment, color: s.color }))

    const front = marks[marks.length - 1]
    out.push({
      text: source.slice(from, to),
      start: from,
      marks,
      ...(front
        ? {
            paint: {
              id: front.id,
              title: marks.map((m) => m.comment).join('\n'),
              bg: front.color.bg,
              // 前面から順に、内側（下端）へ 2px ずつ線を積む
              shadow: marks
                .slice()
                .reverse()
                .map((m, depth) => `inset 0 -${(depth + 1) * 2}px 0 ${m.color.border}`)
                .join(', '),
            },
          }
        : {}),
    })
  }
  return out
})

// 断片内の位置を、本文全体でのオフセットに直す
function offsetOf(node: Node, offsetInNode: number): number | null {
  let el: HTMLElement | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
  while (el && el.dataset.start === undefined) el = el.parentElement
  if (!el || el.dataset.start === undefined) return null
  return Number(el.dataset.start) + offsetInNode
}

function onMouseUp(): void {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return
  const a = offsetOf(sel.anchorNode, sel.anchorOffset)
  const b = offsetOf(sel.focusNode, sel.focusOffset)
  if (a == null || b == null) return
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  if (!props.source.slice(start, end).trim()) return
  emit('select', { text: props.source.slice(start, end), start, end })
  sel.removeAllRanges()
}
</script>

<template>
  <pre
    class="whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed"
    @mouseup="onMouseUp"
  ><template v-for="(seg, i) in segments" :key="i"><mark
      v-if="seg.paint"
      :data-start="seg.start"
      class="cursor-pointer rounded-sm px-0.5"
      :style="{ backgroundColor: seg.paint.bg, boxShadow: seg.paint.shadow }"
      :title="seg.paint.title"
      @click="emit('clickMark', seg.paint.id)"
    >{{ seg.text }}</mark><span v-else :data-start="seg.start">{{ seg.text }}</span></template></pre>
</template>
