/**
 * 注釈の面（`app/components/review/AnnotateSource.vue`）のテストの足場。
 *
 * **テストではないファイルが `test/` に入る例外**（`test/server/api/support.ts` と同じ扱い）。
 *
 * 持っているのは3つ。
 *
 * - `CSS.highlights` / `Highlight` の写し。happy-dom に無いので入れる。見るのは「どの名前に
 *   どの `Range` が入ったか」だけで、見た目（CSS の規則）はここでは見ない
 * - 整形された本文の面を**実物の解析結果**で組む `<MDC>` の代わり。`MarkdownView` は解析を
 *   `<MDC>` に残しているので、その中身だけを差し替える（`parseMarkdown` は実物、描くのは
 *   `MDCRenderer` の写し。`pre` は実物の `MarkdownFence` へ回す）
 * - 図（`MarkdownDiagram`）の代わり。実物は `useColorMode`（Nuxt）を要り、mermaid を
 *   ブラウザでしか描かない。ここで要るのは「注釈の付いた図に生テキストが添えられ、その
 *   `pre` が印を持つ」ことだけなので、実物の template の該当の枝を写す。
 *   **実物（`modules/markdown/runtime/render/MarkdownDiagram.vue`）の枝が変わったら、
 *   ここも直すこと。**
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import type { VNodeChild } from 'vue'

import MarkdownFence from '../../../../modules/markdown/runtime/render/MarkdownFence.vue'
import { FENCE_SOURCE_ATTR } from '../../../../modules/markdown/runtime/render/source-shown'
import { SOURCE_END_ATTR, SOURCE_START_ATTR } from '../../../../modules/markdown/runtime/position/source-span'

import type { SourceRange } from '../../../../modules/markdown/runtime/position/types'
import type { Annotation, HighlightColorName } from '../../../../shared/stroke'

// ---------------------------------------------------------------------------
// CSS Custom Highlight API の写し
// ---------------------------------------------------------------------------

/** `Highlight` の写し。`Set<AbstractRange>` に `priority` が付いただけ */
class HighlightPolyfill extends Set<AbstractRange> {
  priority = 0
  type = 'highlight'
}

/**
 * `CSS.highlights` と `Highlight` を入れる。戻り値の `uninstall` で元に戻す。
 *
 * `registry` は入れた `HighlightRegistry` そのもの。名前 → `Highlight`。
 */
export function installHighlightPolyfill(): { registry: Map<string, Set<AbstractRange>>; uninstall: () => void } {
  const registry = new Map<string, Set<AbstractRange>>()
  const g = globalThis as Record<string, unknown>

  const hadHighlight = Object.getOwnPropertyDescriptor(g, 'Highlight')
  const hadCss = Object.getOwnPropertyDescriptor(g, 'CSS')
  const previousCss = g.CSS

  Object.defineProperty(g, 'Highlight', { value: HighlightPolyfill, configurable: true, writable: true })
  Object.defineProperty(g, 'CSS', {
    value: { ...((previousCss as object | undefined) ?? {}), highlights: registry },
    configurable: true,
    writable: true,
  })

  return {
    registry,
    uninstall() {
      if (hadHighlight) Object.defineProperty(g, 'Highlight', hadHighlight)
      else delete g.Highlight
      if (hadCss) Object.defineProperty(g, 'CSS', hadCss)
      else delete g.CSS
    },
  }
}

// ---------------------------------------------------------------------------
// 注釈の材料
// ---------------------------------------------------------------------------

/** `useAnnotations` の `highlightColors` と同じ実値。塗りは色名しか見ないので値は何でもよい */
const COLOR_VALUES: Record<HighlightColorName, { bg: string; border: string }> = {
  yellow: { bg: 'rgba(255, 235, 59, 0.35)', border: '#FBC02D' },
  green: { bg: 'rgba(76, 175, 80, 0.30)', border: '#388E3C' },
  blue: { bg: 'rgba(33, 150, 243, 0.28)', border: '#1976D2' },
  pink: { bg: 'rgba(233, 30, 99, 0.25)', border: '#C2185B' },
  orange: { bg: 'rgba(255, 152, 0, 0.30)', border: '#F57C00' },
}

/** 位置を持つ注釈を1件作る */
export function selectionComment(
  id: string,
  start: number,
  end: number,
  color: HighlightColorName = 'yellow',
  selectedText = '',
): Annotation {
  return {
    id,
    type: 'selection',
    comment: `comment ${id}`,
    timestamp: '2026-09-01T00:00:00.000Z',
    selectedText,
    startOffset: start,
    endOffset: end,
    highlightColor: { name: color, ...COLOR_VALUES[color] },
  }
}

/** 生テキストの `needle` の箇所。無ければ投げる */
export function rangeOf(source: string, needle: string, nth = 0): SourceRange {
  let at = -1
  for (let i = 0; i <= nth; i++) {
    at = source.indexOf(needle, at + 1)
    if (at < 0) throw new Error(`生テキストに ${JSON.stringify(needle)} の ${nth + 1} 個目が無い`)
  }
  return { start: at, end: at + needle.length }
}

// ---------------------------------------------------------------------------
// DOM の上で範囲を選ぶ
// ---------------------------------------------------------------------------

/** 器の中の text ノードを前から繋いだ文字列 */
export function textOf(container: Node): string {
  return container.textContent ?? ''
}

/**
 * 器の先頭からの文字数を `Range` の端へ。text ノードを前から辿るだけ。
 *
 * text ノードの継ぎ目に当たる位置は、前のノードの末尾とも次のノードの先頭とも書ける。
 * 始まりは次のノードの先頭、終わりは前のノードの末尾に採る（ブラウザが字の上のクリックに
 * 返すキャレットも、その字を持つノードの中に在る）。
 */
function pointAt(container: Node, offset: number, side: 'start' | 'end'): { node: Node; offset: number } {
  let seen = 0
  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === 3) {
      const value = (node as Text).data
      const inside = side === 'start' ? offset < seen + value.length : offset <= seen + value.length
      if (inside) return { node, offset: offset - seen }
      seen += value.length
      return null
    }
    for (const child of Array.from(node.childNodes)) {
      const hit = visit(child)
      if (hit) return hit
    }
    return null
  }
  return visit(container) ?? { node: container, offset: 0 }
}

/** 器に出ている字のうち `needle` の箇所を `Range` にする */
export function domRangeOf(container: Node, needle: string, nth = 0): Range {
  const text = textOf(container)
  let at = -1
  for (let i = 0; i <= nth; i++) {
    at = text.indexOf(needle, at + 1)
    if (at < 0) throw new Error(`面に ${JSON.stringify(needle)} の ${nth + 1} 個目が無い`)
  }
  return domRangeBetween(container, at, at + needle.length)
}

/** 器の先頭から数えた範囲を `Range` にする */
export function domRangeBetween(container: Node, from: number, to: number): Range {
  const head = pointAt(container, from, 'start')
  const tail = pointAt(container, to, 'end')
  const range = document.createRange()
  range.setStart(head.node, head.offset)
  range.setEnd(tail.node, tail.offset)
  return range
}

/** ブラウザの選択を `range` にする。`useTextSelection` は生の `Selection` を読むので、これで足りる */
export function selectDom(range: Range): void {
  const selection = window.getSelection()
  if (!selection) throw new Error('happy-dom に Selection が無い')
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

/**
 * 描画と塗りが落ち着くまで待つ。
 *
 * 解析（`parseMarkdown`）の完了 → DOM の変化 → `MutationObserver` → `requestAnimationFrame`
 * → 塗り、の順に進むので、promise を捌いてから1フレーム分待つ。
 */
export async function settle(): Promise<void> {
  // 解析は本当に非同期（remark の読み込みを含む）なので、終わるまで待つ
  while (pendingParses.size > 0) await Promise.all([...pendingParses])
  await flushPromises()
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await nextTick()
}

// ---------------------------------------------------------------------------
// 整形された本文の面を実物の解析結果で組む
// ---------------------------------------------------------------------------

/** 走っている解析。`settle` はこれが空になるまで待つ */
const pendingParses = new Set<Promise<unknown>>()

/** `modules/markdown/index.ts` の `installModule('@nuxtjs/mdc', …)` と同じ */
const PARSE_OPTIONS = {
  keepPosition: true,
  rehype: { plugins: { 'rehype-raw': false } },
} as const

interface AstNode {
  type: string
  tag?: string
  props?: Record<string, unknown>
  children?: AstNode[]
  value?: string
}

/**
 * AST を vnode へ。`MDCRenderer` が要素と text ノードに対してすることの写し。
 *
 * `pre` は `MDCRenderer` が `components.map` で `MarkdownFence` へ回す。ここも実物の
 * `MarkdownFence` へ回す（図の枝は下の `MarkdownDiagramStub` に差し替わる）。
 */
function renderNodes(nodes: AstNode[]): VNodeChild[] {
  return nodes.map((node) => {
    if (node.type === 'text') return node.value ?? ''
    if (node.type !== 'element' || !node.tag) return null
    const props: Record<string, unknown> = { ...(node.props ?? {}) }
    if ('className' in props) {
      props.class = props.className
      delete props.className
    }
    const children = () => renderNodes(node.children ?? [])
    if (node.tag === 'pre') return h(MarkdownFence, props, { default: children })
    return h(node.tag, props, children())
  })
}

/**
 * `<MDC>` の代わり。実物と同じく `parseMarkdown` で解析し、`#default` へ `body` を渡す。
 * 解析は非同期なので、渡るまでの間は空。
 */
export const MdcParsingStub = defineComponent({
  name: 'MDC',
  props: { value: { type: String, default: '' }, parserOptions: { type: Object, default: null } },
  setup(props, { slots }) {
    const body = shallowRef<unknown>(null)
    const parsing = parseMarkdown(props.value, PARSE_OPTIONS).then((parsed) => {
      body.value = parsed.body
    })
    pendingParses.add(parsing)
    void parsing.finally(() => pendingParses.delete(parsing))
    return () => h('div', slots.default?.({ body: body.value, data: {} }) ?? [])
  },
})

/** `MDCRenderer` の代わり。包んだ後の AST を受けて DOM へ */
export const MdcRendererStub = defineComponent({
  name: 'MDCRenderer',
  props: {
    body: { type: Object as () => AstNode, required: true },
    tag: { type: String, default: 'div' },
    data: { type: Object, default: () => ({}) },
    unwrap: { type: [Boolean, String], default: false },
  },
  setup(props) {
    return () => h(props.tag, renderNodes(props.body.children ?? []))
  },
})

/**
 * `MarkdownDiagram` の代わり。実物の template のうち、SSR 直後の枝（`mermaid-loading`）と
 * 生テキストを添える枝（`mermaid-with-source`）を写す。図（SVG）は描かない。
 *
 * 実物は `svg` が描けてから添えるが、ここでは `showSource` が立っていれば添える。
 * 見たいのは「添えた `pre` が印（`data-fence-source` と `data-src-*`）を持ち、その中の字が
 * 位置の口で引ける」ことである。
 */
export const MarkdownDiagramStub = defineComponent({
  name: 'MarkdownDiagram',
  props: {
    code: { type: String, required: true },
    showSource: { type: Boolean, default: false },
    sourceRange: { type: Object as () => SourceRange | null, default: null },
  },
  setup(props) {
    return () => {
      const diagram = h('div', { class: 'sb-mermaid', 'data-testid': 'mermaid-loading' }, [
        h('span', 'Loading diagram...'),
      ])
      if (!props.showSource) return diagram

      const marks: Record<string, string | number> = {}
      if (props.sourceRange) {
        marks[FENCE_SOURCE_ATTR] = ''
        marks[SOURCE_START_ATTR] = props.sourceRange.start
        marks[SOURCE_END_ATTR] = props.sourceRange.end
      }
      return h('div', { class: 'relative', 'data-testid': 'mermaid-with-source' }, [
        diagram,
        h('details', { open: true, 'data-testid': 'mermaid-source' }, [
          h('summary', 'Source'),
          h('pre', marks, props.code),
        ]),
      ])
    }
  },
})

/** `MarkdownView` を実物の解析結果で描くための `global.stubs` */
export const PREVIEW_STUBS = {
  MDC: MdcParsingStub,
  MDCRenderer: MdcRendererStub,
  MarkdownDiagram: MarkdownDiagramStub,
}
