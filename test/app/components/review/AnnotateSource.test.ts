// @vitest-environment happy-dom
/**
 * 注釈の面（`app/components/review/AnnotateSource.vue`）を、**位置の口の上に載せた形**で固定する。
 *
 * 面は2つとも実物を使う。生テキストの面は `MarkdownSource`、整形された本文の面は `MarkdownView`
 * で、後者は `<MDC>` の中身だけを差し替えて実物の `parseMarkdown` で解析する（`./support.ts`）。
 * 注釈の面はどちらの面に載っているかで分岐しないので、同じ検査を両方の面に回す。
 *
 * 見ているのは `annotation` spec の Scenario（tasks 7章）である。
 *
 * - 同じ語が何度も現れても選んだ箇所だけ（7.1）
 * - 強調をまたいだ選択に付き、本文の DOM が1文字も変わらない（7.2 / 7.3）
 * - フェンスの内側・言語指定の無いフェンス・フェンスをまたぐ選択（7.4 / 7.5 / 7.6）
 * - 図の中の一語・添えても他の箇所が動かない・差し戻しの位置（7.7 / 7.8 / 7.9）
 * - 重なり・飲み込まれた注釈・同一範囲の2件目（7.10）
 * - 差し戻しのペイロードがどちらの面で付けても同じ形（7.13）
 * - 本文 → 一覧は座標から、一覧 → 本文は口から（5.1〜5.4）
 *
 * **happy-dom にはレイアウトが無い。** 「改行位置と折り返しが変わらない」（7.3）は、塗りが
 * 本文の DOM を1文字も書き換えないこと（要素も属性も text ノードも同じ）で見る。DOM が同じなら
 * レイアウトも同じである。座標から文字位置を引く経路（5.1）は `caretPositionFromPoint` /
 * `caretRangeFromPoint` を差し替えて、**どちらが在っても同じ答えになること**を見る。
 */
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import type { VNodeChild } from 'vue'

import AnnotateSource from '../../../../app/components/review/AnnotateSource.vue'
import { FOCUS_HIGHLIGHT_NAME, OVERLAP_HIGHLIGHT_NAME, highlightNameOf } from '../../../../app/composables/useAnnotationHighlight'
import { useAnnotations } from '../../../../app/composables/useAnnotations'
import MarkdownSource from '../../../../modules/markdown/runtime/render/MarkdownSource.vue'
import MarkdownView from '../../../../modules/markdown/runtime/render/MarkdownView.vue'
import {
  PREVIEW_STUBS,
  domRangeBetween,
  domRangeOf,
  installHighlightPolyfill,
  rangeOf,
  selectDom,
  selectionComment,
  settle,
  textOf,
} from './support'

import type { PositionPort, SourceRange } from '../../../../modules/markdown/runtime/position/types'
import type { Annotation } from '../../../../shared/stroke'

type Face = 'source' | 'preview'

/** 位置を持つ選択。`select` で外へ出る形 */
interface Selected {
  text: string
  start: number
  end: number
}

interface Mounted {
  /** 注釈の面の器。`data-testid="annotate"` */
  root: HTMLElement
  /** 面の器（`MarkdownSource` の `pre` か `MarkdownView` の `div`） */
  surface: () => HTMLElement
  port: () => PositionPort | null
  selected: Selected[]
  clicked: string[]
  setComments: (next: Annotation[]) => Promise<void>
  reveal: (id: string) => boolean
  unmount: () => void
}

let uninstall: (() => void) | null = null
let registry: Map<string, Set<AbstractRange>>

beforeEach(() => {
  document.body.innerHTML = ''
  const installed = installHighlightPolyfill()
  uninstall = installed.uninstall
  registry = installed.registry
})

afterEach(() => {
  uninstall?.()
  uninstall = null
  vi.restoreAllMocks()
})

function textsIn(name: string): string[] {
  return [...(registry.get(name) ?? [])].map((r) => r.toString())
}

/**
 * 面を載せた注釈の面を組む。`app/pages/strokes/[sessionId]/proposal.vue` の配線と同じ形:
 * 面はスロットに置き、位置の口は面の `ref` で渡し、`sourceShown` はスロットから
 * `MarkdownView` へ通す。
 */
async function mountFace(face: Face, source: string, comments: Annotation[] = []): Promise<Mounted> {
  const commentsRef = ref<Annotation[]>(comments)
  const surfaceRef = ref<PositionPort | null>(null)
  const annotator = ref<{ reveal: (id: string) => boolean } | null>(null)
  const selected: Selected[] = []
  const clicked: string[] = []

  const Host = defineComponent({
    setup() {
      return () =>
        h(
          AnnotateSource,
          {
            ref: annotator,
            source,
            comments: commentsRef.value,
            port: surfaceRef.value,
            'data-testid': 'annotate',
            onSelect: (p: Selected) => selected.push(p),
            onClickMark: (id: string) => clicked.push(id),
          },
          {
            default: ({ sourceShown }: { sourceShown: SourceRange[] }): VNodeChild =>
              face === 'source'
                ? h(MarkdownSource, { ref: surfaceRef, value: source, testid: 'surface' })
                : h(MarkdownView, { ref: surfaceRef, value: source, sourceShown, testid: 'surface' }),
          },
        )
    },
  })

  const wrapper = mount(Host, { attachTo: document.body, global: { stubs: PREVIEW_STUBS } })
  await settle()

  return {
    root: wrapper.get('[data-testid="annotate"]').element as HTMLElement,
    surface: () => wrapper.get('[data-testid="surface"]').element as HTMLElement,
    port: () => surfaceRef.value,
    selected,
    clicked,
    async setComments(next) {
      commentsRef.value = next
      await settle()
    },
    reveal: (id) => annotator.value?.reveal(id) ?? false,
    unmount: () => wrapper.unmount(),
  }
}

/** 面の上で `needle` を選んで mouseup。`select` が出れば `selected` に積まれる */
async function selectOn(mounted: Mounted, needle: string, nth = 0): Promise<void> {
  selectDom(domRangeOf(mounted.surface(), needle, nth))
  await mounted.root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

/** 塗られた範囲を生テキストの位置へ戻す（面の口で） */
function paintedPositions(mounted: Mounted, name: string): SourceRange[] {
  const port = mounted.port()
  if (!port) throw new Error('口が無い')
  return [...(registry.get(name) ?? [])].map((r) => {
    const position = port.toSourceRange(r as Range)
    if (!position) throw new Error(`塗られた範囲が生テキストへ戻らない: ${r.toString()}`)
    return position
  })
}

const FACES: Face[] = ['source', 'preview']

describe.each(FACES)('%s の面', (face) => {
  it('同じ語が本文に何度も現れても、選んだ箇所だけに注釈が付く（7.1）', async () => {
    const source = 'まえ\n\nいろは にほへと いろは ちりぬる いろは\n'
    const second = rangeOf(source, 'いろは', 1)
    const mounted = await mountFace(face, source, [selectionComment('a', second.start, second.end)])

    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは'])
    expect(paintedPositions(mounted, highlightNameOf('yellow'))).toEqual([second])
  })

  it('選んだ箇所が生テキストの位置で外へ出る。同じ語の2つ目を選べば2つ目の位置', async () => {
    const source = 'まえ\n\nいろは にほへと いろは\n'
    const mounted = await mountFace(face, source)

    await selectOn(mounted, 'いろは', 1)

    expect(mounted.selected).toEqual([{ text: 'いろは', ...rangeOf(source, 'いろは', 1) }])
  })

  it('空白だけの選択は捨てる', async () => {
    const source = 'まえ\n\nいろは   にほへと\n'
    const mounted = await mountFace(face, source)

    await selectOn(mounted, '   ')

    expect(mounted.selected).toEqual([])
  })

  it('一方の面で消した注釈は塗りからも消える（6.10）', async () => {
    const source = 'まえ\n\nいろはにほへと\n'
    const iroha = rangeOf(source, 'いろは')
    const mounted = await mountFace(face, source, [selectionComment('a', iroha.start, iroha.end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは'])

    await mounted.setComments([])

    expect(textsIn(highlightNameOf('yellow'))).toEqual([])
  })

  it('重なった注釈・飲み込まれた注釈・同一範囲の2件目が本文の上に現れる（7.10）', async () => {
    const source = 'まえ\n\nいろはにほへと ちりぬるを\n'
    const outer = rangeOf(source, 'いろはにほへと')
    const inner = rangeOf(source, 'はにほ')
    const tail = rangeOf(source, 'へと ちり')
    const mounted = await mountFace(face, source, [
      selectionComment('outer', outer.start, outer.end, 'yellow'),
      selectionComment('inner', inner.start, inner.end, 'green'),
      selectionComment('tail', tail.start, tail.end, 'yellow'),
      selectionComment('twin', tail.start, tail.end, 'yellow'),
    ])

    // 色ごとの塗り。飲み込まれた inner も、同一範囲の twin も、それぞれ1本ずつ在る
    expect(textsIn(highlightNameOf('green'))).toEqual(['はにほ'])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろはにほへと', 'へと ちり', 'へと ちり'])

    // 重なりの1本。inner（飲み込まれ）・outer と tail の重なり（へと）・tail と twin（へと ちり）
    // が繋がって、`はにほへと ちり` の1つになる
    expect(paintedPositions(mounted, OVERLAP_HIGHLIGHT_NAME)).toEqual([{ start: inner.start, end: tail.end }])
  })

  describe('本文の色 → 一覧のコメント（5.1 / 5.2 / 5.4）', () => {
    const source = 'まえ\n\nいろはにほへと\n'
    const first = rangeOf(source, 'いろはに')
    const second = rangeOf(source, 'はにほへ')

    /** 面の上の `needle` の先頭の字を指す座標の答え */
    function caretAt(mounted: Mounted, needle: string): { node: Node; offset: number } {
      const range = domRangeOf(mounted.surface(), needle)
      return { node: range.startContainer, offset: range.startOffset }
    }

    /**
     * 座標から位置を引く口を差し替える。happy-dom はどちらも持たないので `defineProperty` で
     * 置く（無いものは `vi.spyOn` できない）。`undefined` を渡すと「その口は無い」になる
     */
    function defineCaret(
      name: 'caretPositionFromPoint' | 'caretRangeFromPoint',
      impl: ((...args: unknown[]) => unknown) | undefined,
    ): void {
      Object.defineProperty(document, name, { value: impl ? vi.fn(impl) : undefined, configurable: true, writable: true })
    }

    async function click(mounted: Mounted): Promise<void> {
      await mounted.root.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))
    }

    it('`caretPositionFromPoint` があればそれで引き、最後に付けたコメントを開く', async () => {
      const mounted = await mountFace(face, source, [
        selectionComment('first', first.start, first.end),
        selectionComment('second', second.start, second.end),
      ])
      const caret = caretAt(mounted, 'にほ')
      defineCaret('caretPositionFromPoint', () => ({ offsetNode: caret.node, offset: caret.offset }))
      defineCaret('caretRangeFromPoint', () => {
        throw new Error('caretPositionFromPoint があるのに caretRangeFromPoint を呼んだ')
      })

      await click(mounted)

      expect(mounted.clicked).toEqual(['second'])
    })

    it('`caretPositionFromPoint` が無ければ `caretRangeFromPoint` で引く。答えは同じ', async () => {
      const mounted = await mountFace(face, source, [
        selectionComment('first', first.start, first.end),
        selectionComment('second', second.start, second.end),
      ])
      const caret = caretAt(mounted, 'にほ')
      defineCaret('caretPositionFromPoint', undefined)
      defineCaret('caretRangeFromPoint', () => {
        const r = document.createRange()
        r.setStart(caret.node, caret.offset)
        r.collapse(true)
        return r
      })

      await click(mounted)

      expect(mounted.clicked).toEqual(['second'])
    })

    it('1件しか覆っていない字ならそれを開く。覆っていない字なら開かない', async () => {
      const mounted = await mountFace(face, source, [
        selectionComment('first', first.start, first.end),
        selectionComment('second', second.start, second.end),
      ])
      let at = caretAt(mounted, 'いろ')
      defineCaret('caretPositionFromPoint', () => ({ offsetNode: at.node, offset: at.offset }))

      await click(mounted)

      at = caretAt(mounted, 'と')
      await click(mounted)

      expect(mounted.clicked).toEqual(['first'])
    })

    it('座標が引けない環境では一覧へ辿れないだけで、指摘は付けられる（5.4）', async () => {
      const mounted = await mountFace(face, source, [selectionComment('first', first.start, first.end)])
      defineCaret('caretPositionFromPoint', undefined)
      defineCaret('caretRangeFromPoint', undefined)

      await click(mounted)
      expect(mounted.clicked).toEqual([])

      await selectOn(mounted, 'ほへ')
      expect(mounted.selected).toEqual([{ text: 'ほへ', ...rangeOf(source, 'ほへ') }])
    })

    it('選択を確定した直後の click は色を押した操作ではない', async () => {
      const mounted = await mountFace(face, source, [selectionComment('first', first.start, first.end)])
      const caret = caretAt(mounted, 'いろ')
      defineCaret('caretPositionFromPoint', () => ({ offsetNode: caret.node, offset: caret.offset }))

      // 塗られた範囲の中を選び直す（mouseup → click の順で届く）
      await selectOn(mounted, 'いろ')
      await click(mounted)

      expect(mounted.selected).toHaveLength(1)
      expect(mounted.clicked).toEqual([])
    })
  })

  describe('一覧のコメント → 本文の範囲（5.3）', () => {
    const source = 'まえ\n\nいろはにほへと\n'

    it('位置の口で範囲を引き、目立たせる。座標は使わない', async () => {
      const mounted = await mountFace(face, source, [selectionComment('a', 6, 9)])
      const caret = vi.fn()
      Object.defineProperty(document, 'caretPositionFromPoint', { value: caret, configurable: true, writable: true })

      expect(mounted.reveal('a')).toBe(true)

      expect(textsIn(FOCUS_HIGHLIGHT_NAME)).toEqual(['はにほ'])
      expect(caret).not.toHaveBeenCalled()
    })

    it('無い id や、面に出ていない位置なら false', async () => {
      const mounted = await mountFace(face, source, [selectionComment('a', 6, 9)])

      expect(mounted.reveal('nope')).toBe(false)
      expect(textsIn(FOCUS_HIGHLIGHT_NAME)).toEqual([])
    })
  })
})

describe('両方の面に同じ注釈が出る（6.9）', () => {
  it('一方の面で付けた注釈の位置を、もう一方の面に渡すと同じ字が塗られる', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n'
    const onSource = await mountFace('source', source)
    await selectOn(onSource, '強調')
    const [picked] = onSource.selected
    expect(picked).toEqual({ text: '強調', ...rangeOf(source, '強調') })
    onSource.unmount()

    const onPreview = await mountFace('preview', source, [selectionComment('a', picked!.start, picked!.end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['強調'])
    onPreview.unmount()

    const back = await mountFace('source', source, [selectionComment('a', picked!.start, picked!.end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['強調'])
    back.unmount()
  })
})

describe('整形された本文の面', () => {
  it('強調をまたいだ選択に注釈が付き、本文の DOM は1文字も変わらない（7.2 / 7.3）', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n'
    const mounted = await mountFace('preview', source)
    const before = mounted.surface().innerHTML
    expect(before).toContain('<strong>')

    // 強調の途中から段落の途中まで
    const text = textOf(mounted.surface())
    selectDom(domRangeBetween(mounted.surface(), text.indexOf('ろは'), text.indexOf('にほ') + 2))
    await mounted.root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    const [picked] = mounted.selected
    expect(picked).toEqual({
      text: 'ろは**強調**にほ',
      start: source.indexOf('ろは'),
      end: source.indexOf('にほ') + 2,
    })

    await mounted.setComments([selectionComment('a', picked!.start, picked!.end)])

    expect(textsIn(highlightNameOf('yellow'))).toEqual(['ろは強調にほ'])
    // 要素も属性も text ノードも同じ。`<mark>` も `data-start` も現れない
    expect(mounted.surface().innerHTML).toBe(before)
    expect(mounted.surface().querySelectorAll('mark')).toHaveLength(0)
  })

  it('コードブロックの内側の一部に注釈が付き、生テキストの面でも同じ範囲を指す（7.4）', async () => {
    const source = 'まえ\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\nあと\n'
    const wanted = rangeOf(source, 'const b')
    const onPreview = await mountFace('preview', source, [selectionComment('a', wanted.start, wanted.end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['const b'])
    expect(paintedPositions(onPreview, highlightNameOf('yellow'))).toEqual([wanted])

    await selectOn(onPreview, 'const b')
    expect(onPreview.selected).toEqual([{ text: 'const b', ...wanted }])
    onPreview.unmount()

    const onSource = await mountFace('source', source, [selectionComment('a', wanted.start, wanted.end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['const b'])
    expect(paintedPositions(onSource, highlightNameOf('yellow'))).toEqual([wanted])
  })

  it('言語の指定が無いコードブロックの内側にも付く（7.5）', async () => {
    const source = 'まえ\n\n```\nplain text here\n```\n'
    const mounted = await mountFace('preview', source)

    await selectOn(mounted, 'text')

    expect(mounted.selected).toEqual([{ text: 'text', ...rangeOf(source, 'text') }])
    await mounted.setComments([selectionComment('a', rangeOf(source, 'text').start, rangeOf(source, 'text').end)])
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['text'])
  })

  it('手前の段落からコードブロックの中ほどまでを選ぶと、生テキストの上で連続した1つの範囲（7.6）', async () => {
    const source = 'まえ\n\n```ts\nconst a = 1;\n```\n'
    const mounted = await mountFace('preview', source)

    const text = textOf(mounted.surface())
    selectDom(domRangeBetween(mounted.surface(), text.indexOf('まえ'), text.indexOf('const a') + 7))
    await mounted.root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(mounted.selected).toEqual([{ text: 'まえ\n\n```ts\nconst a', start: 0, end: source.indexOf('const a') + 7 }])
  })

  describe('図（mermaid）', () => {
    const source = 'まえ\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nあと\n'
    const word = rangeOf(source, 'graph')

    it('注釈が1件も無い図には生テキストを添えない（4.3）', async () => {
      const mounted = await mountFace('preview', source)

      expect(mounted.surface().querySelector('[data-testid="mermaid-loading"]')).not.toBeNull()
      expect(mounted.surface().querySelector('[data-fence-source]')).toBeNull()
    })

    it('図の中の一語に付けた注釈で生テキストが添えられ、その一語だけが塗られる（7.7 / 4.1）', async () => {
      const mounted = await mountFace('preview', source, [selectionComment('a', word.start, word.end)])

      // 図は残り、生テキストが添えられる
      expect(mounted.surface().querySelector('[data-testid="mermaid-loading"]')).not.toBeNull()
      const appended = mounted.surface().querySelector('[data-fence-source]')
      expect(appended).not.toBeNull()
      expect(appended!.textContent).toContain('graph TD')

      expect(textsIn(highlightNameOf('yellow'))).toEqual(['graph'])
      expect(paintedPositions(mounted, highlightNameOf('yellow'))).toEqual([word])
    })

    it('添えられた生テキストの一部を選んでも、図全体には広がらない（7.7 後段）', async () => {
      const mounted = await mountFace('preview', source, [selectionComment('a', word.start, word.end)])

      await selectOn(mounted, 'A --> B')

      expect(mounted.selected).toEqual([{ text: 'A --> B', ...rangeOf(source, 'A --> B') }])
    })

    it('注釈が増減するたびに添え書きが付いたり外れたりする（4.5）', async () => {
      const mounted = await mountFace('preview', source)
      expect(mounted.surface().querySelector('[data-fence-source]')).toBeNull()

      await mounted.setComments([selectionComment('a', word.start, word.end)])
      expect(mounted.surface().querySelector('[data-fence-source]')).not.toBeNull()

      await mounted.setComments([])
      expect(mounted.surface().querySelector('[data-fence-source]')).toBeNull()
    })

    it('図の外の注釈では添えられない。渡すのは位置を持つ注釈の範囲すべてで、図の分岐は無い（4.2）', async () => {
      const after = rangeOf(source, 'あと')
      const mounted = await mountFace('preview', source, [selectionComment('a', after.start, after.end)])

      expect(mounted.surface().querySelector('[data-fence-source]')).toBeNull()
      expect(textsIn(highlightNameOf('yellow'))).toEqual(['あと'])
    })

    it('生テキストが添えられても、本文の他の箇所の位置は変わらない（7.8）', async () => {
      const after = rangeOf(source, 'あと')
      const mounted = await mountFace('preview', source, [selectionComment('b', after.start, after.end)])
      const port = mounted.port()!
      expect(port.toSourceRange(domRangeOf(mounted.surface(), 'あと'))).toEqual(after)

      await mounted.setComments([selectionComment('a', word.start, word.end), selectionComment('b', after.start, after.end)])

      expect(mounted.surface().querySelector('[data-fence-source]')).not.toBeNull()
      expect(port.toSourceRange(domRangeOf(mounted.surface(), 'あと'))).toEqual(after)
      expect(paintedPositions(mounted, highlightNameOf('yellow'))).toEqual([word, after])
    })

    it('図に付けた注釈を差し戻しで送っても、位置は付けたときの範囲のまま（7.9）', async () => {
      const mounted = await mountFace('preview', source, [selectionComment('a', word.start, word.end)])
      await selectOn(mounted, 'graph')
      const [picked] = mounted.selected
      expect(picked).toEqual({ text: 'graph', ...word })

      const a = useAnnotations()
      a.addSelection('直す', picked!.text, picked!.start, picked!.end, { name: 'yellow', bg: '', border: '' })
      const [sent] = a.buildPayload().comments
      expect(sent).toMatchObject({ type: 'selection', startOffset: word.start, endOffset: word.end, selectedText: 'graph' })
    })
  })
})

describe('差し戻しのペイロードは、どちらの面で付けても同じ形（7.13）', () => {
  it('同じ箇所を両方の面で選ぶと、同じ位置・同じ引用になる', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n'
    const onSource = await mountFace('source', source)
    await selectOn(onSource, '強調')
    onSource.unmount()
    const onPreview = await mountFace('preview', source)
    await selectOn(onPreview, '強調')

    const color = { name: 'green' as const, bg: 'rgba(76, 175, 80, 0.30)', border: '#388E3C' }
    const fromSource = useAnnotations()
    const fromPreview = useAnnotations()
    const s = onSource.selected[0]!
    const p = onPreview.selected[0]!
    fromSource.addSelection('直す', s.text, s.start, s.end, color)
    fromPreview.addSelection('直す', p.text, p.start, p.end, color)

    const strip = (c: Annotation): Omit<Annotation, 'id' | 'timestamp'> => {
      const { id: _id, timestamp: _timestamp, ...rest } = c
      return rest
    }
    const a = fromSource.buildRevisionPayload().comments.map(strip)
    const b = fromPreview.buildRevisionPayload().comments.map(strip)
    expect(a).toEqual(b)
    expect(a[0]).toEqual({
      type: 'selection',
      comment: '直す',
      selectedText: '強調',
      startOffset: source.indexOf('強調'),
      endOffset: source.indexOf('強調') + 2,
      highlightColor: color,
    })
    // 保存形の鍵は変わらない
    expect(Object.keys(fromSource.buildRevisionPayload()).sort()).toEqual(['annotations', 'comments', 'response'])
    expect(Object.keys(fromSource.buildPayload()).sort()).toEqual(['annotations', 'comments', 'nextSteps', 'response'])
  })
})

describe('位置の口が無いとき（7.12）', () => {
  it('塗らずに落とし、例外にしない', async () => {
    const Host = defineComponent({
      setup() {
        return () => h(AnnotateSource, { source: 'いろは', comments: [selectionComment('a', 0, 3)], port: null, 'data-testid': 'annotate' })
      },
    })

    expect(() => mount(Host, { attachTo: document.body })).not.toThrow()
    await settle()
    expect(registry.size).toBe(0)
  })
})

describe('塗れない環境（2.7）', () => {
  it('色は付かないが、選択して注釈を付ける操作は動く', async () => {
    uninstall?.()
    uninstall = null
    const source = 'まえ\n\nいろはにほへと\n'
    const mounted = await mountFace('source', source, [selectionComment('a', 3, 6)])

    await selectOn(mounted, 'ほへ')

    expect(mounted.selected).toEqual([{ text: 'ほへ', ...rangeOf(source, 'ほへ') }])
  })
})
