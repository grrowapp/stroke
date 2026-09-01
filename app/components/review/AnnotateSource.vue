<script setup lang="ts">
// 注釈の面。位置の口（`PositionPort`）を出す面を1つ受け取り、その上に注釈を塗る。
//
// **本文をどう描くかは知らない。** 生テキストの面（`MarkdownSource`）も整形された本文の面
// （`MarkdownView`）も同じ形で位置の口を出すので、ここに面の分岐は無い。面はスロットで
// 受け取り、口は `port` で受け取る。どちらの面に載っているかは呼ぶ側だけが知っている。
//
// 選択範囲は本文全体での文字オフセット（start / end）で持つ。レンダリング後の HTML では
// なく生テキストに対して付けるため、同じ語が本文に何度現れても、選んだ箇所だけが残る。
//
// 塗りは `useAnnotationHighlight`（CSS Custom Highlight API）。本文の要素を作らないので、
// 強調・リンク・見出しを跨いだ選択にも付き、注釈の有無で本文の改行位置も折り返しも動かない。
//
// 塗られた範囲は要素ではないので、クリックの当たり判定が無い。本文 → 一覧は、この器に置いた
// クリックの座標から文字位置を引く（`caretPositionFromPoint` / `caretRangeFromPoint` の両方を
// 見る。ブラウザによってどちらが在るかが違う）。一覧 → 本文は位置の口（`toDomRange`）で引き、
// 座標を使わない。
import { useTextSelection } from '@vueuse/core'
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import {
  commentIdAt,
  isValidSourceRange,
  selectionRangesOf,
  sourceShownOf,
  useAnnotationHighlight,
} from '~/composables/useAnnotationHighlight'

import type { PositionPort, SourceRange } from '#markdown/position/types'
import type { Annotation } from '#shared/stroke'

const props = defineProps<{
  /** 面に渡した生テキスト。注釈のオフセットはこの文字列に対して付く */
  source: string
  comments: Annotation[]
  /**
   * 面が出している位置の口。面の `ref` をそのまま渡す（`MarkdownView` / `MarkdownSource` は
   * `defineExpose` で `PositionPort` を名乗る）。面がまだ描かれていなければ `null`
   */
  port?: PositionPort | null
}>()

const emit = defineEmits<{
  select: [payload: { text: string; start: number; end: number }]
  clickMark: [id: string]
}>()

defineSlots<{
  /**
   * 面。`sourceShown` は図に生テキストを添えたい範囲で、整形された本文の面
   * （`MarkdownView`）の同名の prop へそのまま渡す。生テキストの面では使わない
   */
  default(props: { sourceShown: SourceRange[] }): unknown
}>()

const root = useTemplateRef<HTMLElement>('root')

/** 位置を持つ注釈のうち、範囲が妥当なもの。付けた順 */
const selections = computed(() => selectionRangesOf(props.comments, props.source.length))

/**
 * 図に生テキストを添えたい範囲。位置を持つ注釈の範囲そのもの（design 決定7）。
 *
 * 図に付いたかどうかで選ばない。図と重なるかは markdown の側が見る。基準は取得したままの
 * 文字列で、揃える手続きをここに持たない（面が内側で写像を通す）。
 */
const sourceShown = computed<SourceRange[]>(() => sourceShownOf(props.comments, props.source.length))

// --- 塗り

const highlight = useAnnotationHighlight({
  port: () => props.port,
  source: () => props.source,
  comments: () => props.comments,
})

/**
 * DOM が変わったら塗り直す。整形された本文は解析の完了と図の描画の完了で中身が
 * 入れ替わるので、注釈が変わらなくても `Range` は古くなる。塗りは DOM を書き換えないので、
 * ここから塗りへ戻るループは起きない。
 */
let observer: MutationObserver | null = null
let scheduled = false

function schedulePaint(): void {
  if (scheduled) return
  scheduled = true
  const run = (): void => {
    scheduled = false
    highlight.paint()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else run()
}

onMounted(() => {
  highlight.paint()
  const el = root.value
  if (!el || typeof MutationObserver !== 'function') return
  observer = new MutationObserver(schedulePaint)
  observer.observe(el, { childList: true, subtree: true, characterData: true })
})

// 注釈・本文・口のどれが変わっても作り直す。`Highlight` を保持しない（R1）
watch([selections, () => props.source, () => props.port], () => highlight.paint(), { flush: 'post' })

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  highlight.clear()
})

// --- 選択 → 注釈

/**
 * 選択の追跡。`selectionchange` を追う VueUse の `useTextSelection`（design 決定4）。
 *
 * 読むのは `selection`（生の `Selection`。生きているオブジェクトなので、読んだ瞬間の
 * 選択が取れる）。`ranges` は `selectionchange` が届いてから更新される computed で、
 * ダブルクリックの語の選択などでは mouseup の時点でまだ古いことがある。
 */
const { selection } = useTextSelection()

/** 選択を確定した直後の click を、色を押した操作と取り違えないための印 */
let justSelected = false

function currentRange(): Range | null {
  const sel = selection.value
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const el = root.value
  if (!el || !el.contains(range.commonAncestorContainer)) return null
  return range
}

function onMouseUp(): void {
  const range = currentRange()
  if (!range) return
  justSelected = true

  const port = props.port
  if (!port) return
  const position = port.toSourceRange(range)
  if (!isValidSourceRange(position, props.source.length)) return

  const text = props.source.slice(position.start, position.end)
  // 空白だけの選択は捨てる（振る舞いは以前と同じ）
  if (!text.trim()) return

  emit('select', { text, start: position.start, end: position.end })
  selection.value?.removeAllRanges()
}

// --- 本文の色 → 一覧のコメント

/**
 * 座標の下の1文字を指す `Range`。引けなければ `null`。
 *
 * `caretPositionFromPoint`（標準）と `caretRangeFromPoint`（WebKit 系）の**両方を見る**。
 * 片方しか見ない実装にしない（R4）。返るのは字と字の間（キャレット）なので、その右隣の
 * 1文字（無ければ左隣）を範囲にする。位置の口は幅0の範囲を「重ならない」と見て `null` を
 * 返すことがあるためである。
 */
function characterRangeAt(x: number, y: number): Range | null {
  const doc = root.value?.ownerDocument
  if (!doc) return null

  let node: Node | null = null
  let offset = 0

  if (typeof doc.caretPositionFromPoint === 'function') {
    const caret = doc.caretPositionFromPoint(x, y)
    if (!caret) return null
    node = caret.offsetNode
    offset = caret.offset
  } else if (typeof doc.caretRangeFromPoint === 'function') {
    const caret = doc.caretRangeFromPoint(x, y)
    if (!caret) return null
    node = caret.startContainer
    offset = caret.startOffset
  } else {
    return null
  }

  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const length = (node as Text).data.length
  if (length === 0) return null

  const range = doc.createRange()
  if (offset < length) {
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
  } else {
    range.setStart(node, length - 1)
    range.setEnd(node, length)
  }
  return range
}

function onClick(event: MouseEvent): void {
  if (justSelected) {
    justSelected = false
    return
  }
  const port = props.port
  if (!port) return

  const range = characterRangeAt(event.clientX, event.clientY)
  if (!range) return
  const position = port.toSourceRange(range)
  if (!position) return

  const id = commentIdAt(selections.value, position.start)
  if (id !== null) emit('clickMark', id)
}

// --- 一覧のコメント → 本文の範囲

/**
 * id のコメントが指す範囲を本文の上で示す。位置の口（`toDomRange`）で引き、**座標を使わない**
 * （design 決定5）。範囲まで画面を寄せ、しばらくの間だけ目立たせる。
 *
 * 引けなければ `false`（面が描かれていない・その位置が面に出ていない）。
 */
function reveal(id: string): boolean {
  const port = props.port
  const found = selections.value.find((s) => s.id === id)
  if (!port || !found) return false

  const range = port.toDomRange({ start: found.start, end: found.end })
  if (!range) return false

  const node = range.startContainer
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' })

  highlight.focus(range)
  return true
}

defineExpose({ reveal })
</script>

<template>
  <div ref="root" @mouseup="onMouseUp" @click="onClick">
    <slot :source-shown="sourceShown" />
  </div>
</template>
