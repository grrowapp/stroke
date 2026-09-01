// @vitest-environment happy-dom
/**
 * 注釈の塗り（`app/composables/useAnnotationHighlight.ts`）を固定する。
 *
 * - 範囲の妥当性の述語（tasks 1.2 / 7.11）。`SourceRange` を branded type にしない代わりに置いたもの
 * - 重なりの数え方（2件以上に覆われた範囲を1本に集める。design 決定3）
 * - 本文 → 一覧で開くコメントの決め方（最後に付けたもの。tasks 5.2）
 * - 位置の口が `null` を返したときの倒れ方（塗らずに落とし、例外にしない。tasks 7.12）
 * - 塗れない環境で何も起きないこと（tasks 2.6 / 2.7）
 *
 * `CSS.highlights` と `Highlight` は happy-dom に無いので、`test/app/components/review/support.ts`
 * の写しを入れて「どの名前に、どの `Range` が入ったか」を見る。見た目（CSS の規則）は
 * ここでは見ない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FOCUS_HIGHLIGHT_NAME,
  OVERLAP_HIGHLIGHT_NAME,
  commentIdAt,
  highlightNameOf,
  isValidSourceRange,
  overlappedRangesOf,
  selectionRangesOf,
  sourceShownOf,
  supportsHighlight,
  useAnnotationHighlight,
} from '../../../app/composables/useAnnotationHighlight'
import { installHighlightPolyfill, selectionComment } from '../components/review/support'

import type { PositionPort, SourceRange } from '../../../modules/markdown/runtime/position/types'

describe('isValidSourceRange', () => {
  it('start < end かつ両端が本文の長さの内側なら妥当', () => {
    expect(isValidSourceRange({ start: 0, end: 3 }, 3)).toBe(true)
    expect(isValidSourceRange({ start: 1, end: 2 }, 3)).toBe(true)
  })

  it('長さの外側は落とす', () => {
    expect(isValidSourceRange({ start: 0, end: 4 }, 3)).toBe(false)
    expect(isValidSourceRange({ start: -1, end: 2 }, 3)).toBe(false)
  })

  it('開始が終了以上なら落とす', () => {
    expect(isValidSourceRange({ start: 2, end: 2 }, 3)).toBe(false)
    expect(isValidSourceRange({ start: 3, end: 1 }, 3)).toBe(false)
  })

  it('位置の口が返す null は妥当な範囲ではない', () => {
    expect(isValidSourceRange(null, 3)).toBe(false)
    expect(isValidSourceRange(undefined, 3)).toBe(false)
  })

  it('整数でなければ落とす', () => {
    expect(isValidSourceRange({ start: 0.5, end: 2 }, 3)).toBe(false)
    expect(isValidSourceRange({ start: 0, end: Number.NaN }, 3)).toBe(false)
  })
})

describe('selectionRangesOf / sourceShownOf', () => {
  const source = '0123456789'

  it('位置を持つ注釈だけを、付けた順に並べる', () => {
    const comments = [
      selectionComment('a', 2, 5, 'green'),
      { id: 'g', type: 'general' as const, comment: 'x', timestamp: '' },
      selectionComment('b', 0, 1, 'blue'),
    ]
    expect(selectionRangesOf(comments, source.length)).toEqual([
      { id: 'a', color: 'green', start: 2, end: 5 },
      { id: 'b', color: 'blue', start: 0, end: 1 },
    ])
  })

  it('範囲が妥当でない注釈は落とす（以前の clamp の代わり。切り詰めない）', () => {
    const comments = [selectionComment('a', 8, 20), selectionComment('b', 3, 3)]
    expect(selectionRangesOf(comments, source.length)).toEqual([])
  })

  it('図に添えたい範囲は位置を持つ注釈の範囲そのもの。呼ぶたびに新しい配列', () => {
    const comments = [selectionComment('a', 2, 5)]
    const first = sourceShownOf(comments, source.length)
    const second = sourceShownOf(comments, source.length)
    expect(first).toEqual<SourceRange[]>([{ start: 2, end: 5 }])
    expect(first).not.toBe(second)
    expect(sourceShownOf([], source.length)).toEqual([])
  })
})

describe('overlappedRangesOf', () => {
  it('一部が重なる2件: 重なった部分だけ', () => {
    expect(overlappedRangesOf([{ start: 0, end: 5 }, { start: 3, end: 8 }])).toEqual([{ start: 3, end: 5 }])
  })

  it('飲み込まれた注釈: 内側の範囲がそのまま', () => {
    expect(overlappedRangesOf([{ start: 0, end: 10 }, { start: 3, end: 5 }])).toEqual([{ start: 3, end: 5 }])
  })

  it('同一範囲に2件: その範囲', () => {
    expect(overlappedRangesOf([{ start: 2, end: 6 }, { start: 2, end: 6 }])).toEqual([{ start: 2, end: 6 }])
  })

  it('端が触れているだけなら重なりではない', () => {
    expect(overlappedRangesOf([{ start: 0, end: 3 }, { start: 3, end: 6 }])).toEqual([])
  })

  it('3件が段々に重なる: 隣り合う断片は1つに繋ぐ', () => {
    const ranges = [
      { start: 0, end: 6 },
      { start: 2, end: 8 },
      { start: 4, end: 10 },
    ]
    // 2..4 は2件、4..6 は3件、6..8 は2件。どれも2件以上なので 2..8 の1つ
    expect(overlappedRangesOf(ranges)).toEqual([{ start: 2, end: 8 }])
  })

  it('1件だけなら空', () => {
    expect(overlappedRangesOf([{ start: 0, end: 5 }])).toEqual([])
  })
})

describe('commentIdAt', () => {
  const selections = [
    { id: 'first', color: 'yellow' as const, start: 0, end: 6 },
    { id: 'second', color: 'green' as const, start: 3, end: 9 },
  ]

  it('覆っているコメントが複数なら、最後に付けたもの', () => {
    expect(commentIdAt(selections, 4)).toBe('second')
  })

  it('1件だけが覆っていればそれ', () => {
    expect(commentIdAt(selections, 1)).toBe('first')
    expect(commentIdAt(selections, 7)).toBe('second')
  })

  it('終端は含まない。どれも覆っていなければ null', () => {
    expect(commentIdAt(selections, 9)).toBeNull()
    expect(commentIdAt([], 0)).toBeNull()
  })
})

describe('useAnnotationHighlight', () => {
  const source = 'いろはにほへと ちりぬるを'

  /** `toDomRange` を DOM 無しで済ませる口。`source` の範囲を持つ `Range` を text ノードから作る */
  function fakePort(unmappable: SourceRange[] = []): { port: PositionPort; node: Text } {
    const node = document.createTextNode(source)
    document.body.append(node)
    const port: PositionPort = {
      toSourceRange: () => null,
      toDomRange(range) {
        if (unmappable.some((u) => u.start === range.start && u.end === range.end)) return null
        const r = document.createRange()
        r.setStart(node, range.start)
        r.setEnd(node, range.end)
        return r
      },
    }
    return { port, node }
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
    vi.useRealTimers()
  })

  function textsIn(name: string): string[] {
    return [...(registry.get(name) ?? [])].map((r) => r.toString())
  }

  it('色ごとの名前に、その注釈の範囲が入る', () => {
    const { port } = fakePort()
    const comments = [selectionComment('a', 0, 3, 'yellow'), selectionComment('b', 8, 12, 'blue')]
    const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => comments })

    h.paint()

    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは'])
    expect(textsIn(highlightNameOf('blue'))).toEqual(['ちりぬる'])
    expect(textsIn(OVERLAP_HIGHLIGHT_NAME)).toEqual([])
  })

  it('2件以上に覆われた範囲は1本の重なりの名前に入る。同一範囲・同色でも', () => {
    const { port } = fakePort()
    const comments = [selectionComment('a', 0, 5, 'yellow'), selectionComment('b', 0, 5, 'yellow')]
    const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => comments })

    h.paint()

    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろはにほ', 'いろはにほ'])
    expect(textsIn(OVERLAP_HIGHLIGHT_NAME)).toEqual(['いろはにほ'])
  })

  it('塗り直すと前に入れた Range は外れ、いまの注釈だけになる', () => {
    const { port } = fakePort()
    let comments = [selectionComment('a', 0, 3, 'yellow')]
    const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => comments })

    h.paint()
    comments = [selectionComment('b', 8, 12, 'yellow')]
    h.paint()

    expect(textsIn(highlightNameOf('yellow'))).toEqual(['ちりぬる'])
  })

  it('別の面が同じ名前に入れた Range には触らない', () => {
    const { port } = fakePort()
    const mine = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => [selectionComment('a', 0, 3)] })
    const other = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => [selectionComment('a', 0, 3)] })

    mine.paint()
    other.paint()
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは', 'いろは'])

    mine.clear()
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは'])
  })

  it('位置の口が null を返した範囲は塗らずに落とす。例外にしない（7.12）', () => {
    const { port } = fakePort([{ start: 8, end: 12 }])
    const comments = [selectionComment('a', 0, 3, 'yellow'), selectionComment('b', 8, 12, 'yellow')]
    const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => comments })

    expect(() => h.paint()).not.toThrow()
    expect(textsIn(highlightNameOf('yellow'))).toEqual(['いろは'])
  })

  it('口そのものが無ければ何も塗らない。例外にしない', () => {
    const h = useAnnotationHighlight({ port: () => null, source: () => source, comments: () => [selectionComment('a', 0, 3)] })

    expect(() => h.paint()).not.toThrow()
    expect(registry.size).toBe(0)
  })

  it('一覧から辿った範囲は別の名前に入り、時間で外れる', () => {
    vi.useFakeTimers()
    const { port } = fakePort()
    const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => [] })

    h.focus(port.toDomRange({ start: 0, end: 3 })!)
    expect(textsIn(FOCUS_HIGHLIGHT_NAME)).toEqual(['いろは'])

    // 次に辿ったら前のは外れる。目立たせるのは1つだけ
    h.focus(port.toDomRange({ start: 8, end: 12 })!)
    expect(textsIn(FOCUS_HIGHLIGHT_NAME)).toEqual(['ちりぬる'])

    vi.runAllTimers()
    expect(textsIn(FOCUS_HIGHLIGHT_NAME)).toEqual([])
  })

  describe('塗れない環境（`CSS.highlights` が無い）', () => {
    beforeEach(() => {
      uninstall?.()
      uninstall = null
    })

    it('判定は `CSS.highlights` の有無で行う', () => {
      expect(supportsHighlight()).toBe(false)
    })

    it('塗りも辿りも例外にしない。塗りは起きない', () => {
      const { port } = fakePort()
      const h = useAnnotationHighlight({ port: () => port, source: () => source, comments: () => [selectionComment('a', 0, 3)] })

      expect(() => h.paint()).not.toThrow()
      expect(() => h.focus(port.toDomRange({ start: 0, end: 3 })!)).not.toThrow()
      expect(() => h.clear()).not.toThrow()
    })
  })
})
