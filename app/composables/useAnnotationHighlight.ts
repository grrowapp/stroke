// 注釈の塗り。CSS Custom Highlight API で、本文の要素構造に一切触れずに範囲を塗る。
//
// **本文の DOM を1文字も書き換えない。** 以前は本文を注釈の境界で切って `<mark>` で包んで
// いたが、整形された本文は強調・リンク・見出しが要素になっており、その境界を跨いだ選択を
// 包むと要素の入れ子が壊れる。塗りが要素を作らなければ、どの面にも同じ塗りが載る。
//
// 注釈の側が知っているのは、生テキストと、描いた本文と生テキストの位置の対応
// （`PositionPort`）だけである。markdown をどう描いているかは知らない。
//
// ## 塗りの構成
//
// - 色ごとに1つの `Highlight`（`sb-annotation-<色名>`）。見た目は `app/assets/css/main.css` の
//   `::highlight()` 規則が持つ。`::highlight()` は inline style を受け取れないので、色の実値は
//   CSS に置くほかない。`useAnnotations` の `highlightColors`（実値）は保存形と色見本が使う
//   ままにし、塗りは色**名**でだけ引く
// - 2件以上に覆われている範囲だけを集めた `Highlight` を**1本**（`sb-annotation-overlap`）。
//   `Highlight.priority` は同じ範囲を1つに畳むので、同一範囲・同色の2件目が本文の上から消える。
//   件数から作る1本なら、色が同じでも「2件ある」ことが本文の上に出る
//
// ## `::highlight()` に効くプロパティ（実測 Chromium 151、2026-09-01）
//
// 効く: `background-color` / `color` / `text-decoration`（下線の種類・色・太さ・オフセット）/
// `text-shadow`。効かない: `border` / `outline` / `box-shadow` / `padding` / `margin` /
// `font-weight` / `cursor`。レイアウトはどれも動かない。以前の重なりの表し方（`inset box-shadow`
// を 2px ずつ積む）はそのまま移せないので、重なりは上の1本を下線で出す。
//
// ## 保持しない
//
// `Range` は DOM が変わると別の場所を指す。整形された本文は解析の完了と図の描画の完了で
// 中身が入れ替わるので、塗った時点の `Range` を持ち続けると黙って別の場所を塗る。位置の口が
// 「呼ばれるたびに作る。保持しない」のに倣い、塗りも本文・注釈・DOM の変化のたびに作り直す。
//
// ## 塗れない環境
//
// `CSS.highlights` が無ければ色が付かないだけで、本文は読め、選択して注釈を付けられ、脇の
// 一覧から編集と削除に入れる。代替の塗り（`<mark>`）は用意しない——整形の面で要素構造を壊す
// 経路を残さないため。判定は `CSS.highlights` の有無で行い、ブラウザの版番号を見ない。
import type { PositionPort, SourceRange } from '#markdown/position/types'
import type { Annotation, HighlightColorName } from '#shared/stroke'

/** 塗りの名前の頭。CSS の `::highlight(sb-annotation-yellow)` などと対になる */
export const HIGHLIGHT_NAME_PREFIX = 'sb-annotation-'

/** 2件以上に覆われている範囲を示す1本の名前 */
export const OVERLAP_HIGHLIGHT_NAME = `${HIGHLIGHT_NAME_PREFIX}overlap`

/** 一覧から辿ったコメントの範囲を、しばらくの間だけ目立たせる1本の名前 */
export const FOCUS_HIGHLIGHT_NAME = `${HIGHLIGHT_NAME_PREFIX}focus`

/** 一覧から辿った範囲を目立たせておく時間 */
export const FOCUS_DURATION_MS = 1600

/** 色名 → 塗りの名前 */
export function highlightNameOf(color: HighlightColorName): string {
  return `${HIGHLIGHT_NAME_PREFIX}${color}`
}

/**
 * 生テキストの範囲として妥当か。`start < end` かつ両端が本文の長さの内側。
 *
 * `SourceRange` を branded type にしない代わりに置く述語（design 決定2）。以前は `clamp` と
 * `start < end` が塗りの側に散っていた。範囲の妥当性の判定はここ1つだけにする。
 *
 * 位置の口が返す `null` もここで落ちる（`null` は妥当な範囲ではない）。
 */
export function isValidSourceRange(
  range: SourceRange | null | undefined,
  length: number,
): range is SourceRange {
  if (!range) return false
  const { start, end } = range
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false
  return start >= 0 && start < end && end <= length
}

/** 塗りが使えるか。`CSS.highlights` の有無で見る。版番号は見ない */
export function supportsHighlight(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    CSS.highlights !== undefined &&
    typeof Highlight === 'function'
  )
}

/** 位置を持つ注釈1件ぶんの、塗りに要る材料 */
export interface SelectionRange extends SourceRange {
  id: string
  color: HighlightColorName
}

/**
 * 位置を持つ注釈のうち、範囲が妥当なものを**付けた順**に並べる。
 *
 * 順が要るのは「覆っているコメントが複数あるときは最後に付けたものを開く」ため。
 */
export function selectionRangesOf(comments: readonly Annotation[], length: number): SelectionRange[] {
  const out: SelectionRange[] = []
  for (const c of comments) {
    if (c.type !== 'selection') continue
    const range = { start: c.startOffset, end: c.endOffset }
    if (!isValidSourceRange(range, length)) continue
    out.push({ id: c.id, color: c.highlightColor.name, ...range })
  }
  return out
}

/**
 * 図に生テキストを添えたい範囲。位置を持つ注釈の範囲そのもの。
 *
 * 図に付いたかどうかで選ばない（design 決定7）。図と重なるかは markdown の側が見る。
 * 呼ばれるたびに新しい配列を返す。渡す先（`MarkdownView` の `sourceShown`）は写像を本文にだけ
 * 従わせているので、注釈の増減のたびに新しい参照を渡してよい。
 */
export function sourceShownOf(comments: readonly Annotation[], length: number): SourceRange[] {
  return selectionRangesOf(comments, length).map(({ start, end }) => ({ start, end }))
}

/**
 * 2件以上に覆われている範囲。
 *
 * 範囲の境界で区切った断片ごとに覆っている件数を数え、2件以上の断片を隣どうし繋いで返す。
 * 完全に飲み込まれた注釈も、同一範囲の2件目も、ここに現れる。
 */
export function overlappedRangesOf(selections: readonly SourceRange[]): SourceRange[] {
  const bounds = [...new Set(selections.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b)
  const out: SourceRange[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i]
    const to = bounds[i + 1]
    if (from === undefined || to === undefined || from >= to) continue
    const covering = selections.filter((s) => s.start <= from && to <= s.end).length
    if (covering < 2) continue
    const last = out[out.length - 1]
    if (last && last.end === from) last.end = to
    else out.push({ start: from, end: to })
  }
  return out
}

/**
 * 生テキストの `offset` 文字目を覆っている注釈のうち、**最後に付けたもの**の id。無ければ `null`。
 *
 * 本文の色を押したときに開くコメントを決める。以前の `marks[marks.length - 1]` と同じ決め方。
 */
export function commentIdAt(selections: readonly SelectionRange[], offset: number): string | null {
  for (let i = selections.length - 1; i >= 0; i--) {
    const s = selections[i]
    if (s && s.start <= offset && offset < s.end) return s.id
  }
  return null
}

/** 塗りの材料。すべて getter で受け、呼ばれるたびに読む（保持しない） */
export interface AnnotationHighlightSource {
  /** 面が出している位置の口。面が描かれていなければ `null` */
  port: () => PositionPort | null | undefined
  /** 面に渡した生テキスト */
  source: () => string
  comments: () => readonly Annotation[]
}

/**
 * `CSS.highlights` の中の、この名前の `Highlight`。無ければ作って登録する。
 *
 * **`Highlight` は面ごとに持たず、名前で共有する。** `::highlight()` の規則は名前で引くので、
 * 同じ色は同じ1本に入れる。同じ画面に面が2つ載っていても（承認画面はプレビューを
 * `v-show` で残す）規則は1組で足りる。
 */
function highlightNamed(name: string): Highlight {
  const registry = CSS.highlights
  const found = registry.get(name)
  if (found) return found
  const created = new Highlight()
  registry.set(name, created)
  return created
}

/**
 * 塗る側。1つの面（`AnnotateSource` 1つ）につき1つ持つ。
 *
 * 自分が入れた `Range` だけを覚えておき、塗り直すときはそれだけを外す。他の面が同じ
 * `Highlight` に入れた `Range` には触らない。
 */
export function useAnnotationHighlight(input: AnnotationHighlightSource) {
  /** この面が `Highlight` に入れた `Range`。名前ごと */
  let own = new Map<string, Range[]>()

  /** 一覧から辿って目立たせている範囲と、それを外す予約 */
  let focused: Range | null = null
  let focusTimer: ReturnType<typeof setTimeout> | null = null

  function unfocus(): void {
    if (focusTimer !== null) clearTimeout(focusTimer)
    focusTimer = null
    if (focused && supportsHighlight()) CSS.highlights.get(FOCUS_HIGHLIGHT_NAME)?.delete(focused)
    focused = null
  }

  /**
   * 一覧 → 本文。渡された範囲をしばらくの間だけ目立たせる。
   *
   * 範囲は位置の口（`toDomRange`）から得たものを渡す。座標を使わない（design 決定5）。
   * 前に目立たせていた範囲は外す。目立たせるのは1つだけ。
   */
  function focus(range: Range): void {
    unfocus()
    if (!supportsHighlight()) return
    highlightNamed(FOCUS_HIGHLIGHT_NAME).add(range)
    focused = range
    focusTimer = setTimeout(unfocus, FOCUS_DURATION_MS)
  }

  function clear(): void {
    unfocus()
    if (!supportsHighlight()) return
    for (const [name, ranges] of own) {
      const highlight = CSS.highlights.get(name)
      if (!highlight) continue
      for (const range of ranges) highlight.delete(range)
    }
    own = new Map()
  }

  /**
   * 塗り直す。いま入れている `Range` をすべて外し、注釈と DOM の現状から作り直す。
   *
   * 位置の口が `null` を返した範囲は塗らずに落とす。例外にしない。
   * 一覧から辿って目立たせている範囲は、塗り直しでは外さない（DOM が変わっていれば
   * 指す先は古いが、時間で消えるものなので作り直さない）。
   */
  function paint(): void {
    if (!supportsHighlight()) return
    for (const [name, ranges] of own) {
      const highlight = CSS.highlights.get(name)
      if (!highlight) continue
      for (const range of ranges) highlight.delete(range)
    }
    own = new Map()

    const port = input.port()
    if (!port) return
    const source = input.source()
    const selections = selectionRangesOf(input.comments(), source.length)
    if (selections.length === 0) return

    const next = new Map<string, Range[]>()
    const put = (name: string, range: SourceRange): void => {
      const dom = port.toDomRange(range)
      if (!dom) return
      highlightNamed(name).add(dom)
      const list = next.get(name)
      if (list) list.push(dom)
      else next.set(name, [dom])
    }

    for (const s of selections) put(highlightNameOf(s.color), s)
    for (const r of overlappedRangesOf(selections)) put(OVERLAP_HIGHLIGHT_NAME, r)

    own = next
  }

  return { paint, clear, focus, supported: supportsHighlight }
}
