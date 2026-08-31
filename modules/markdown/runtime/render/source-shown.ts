/**
 * 「この図には生テキストを添える」を外から渡す口。
 *
 * **markdown モジュールは注釈を知らない。** 図（mermaid）は絵になるので、図の中のある字を
 * 指す位置が画面上に存在しない。そこで注釈の付いた図にだけ、もとになった生テキストを
 * 添えて出す（`../render/MarkdownDiagram.vue`）。だが「注釈が付いているか」はモジュールの
 * 外の話なので、判断そのものを持ち込まない。外から渡ってくるのは
 * **「ソースを見せたい生テキストの範囲の配列」**（`SourceRange[]`）だけで、モジュールは
 * その範囲が自分のフェンスの範囲と重なるかしか見ない。注釈・コメント・検索の当たり、
 * どれを渡しても同じように働く。
 *
 * **渡し方は provide/inject である。** props では届かない。MDC はコードブロックを
 * `resolveComponent('MarkdownFence')` で自分で作るので（`@nuxtjs/mdc` の `MDCRenderer.vue`）、
 * `MarkdownView` から `MarkdownFence` へ渡す経路が親子の props に無い。
 *
 * **provide が無ければ「範囲なし」である。** 既定は図だけを出す。渡す側を持たない画面
 * （ストローク側の本文など）で見え方が変わらないようにするため、既定値を空の配列にして
 * inject の警告も出さない。
 */
import { computed, inject, toValue } from 'vue';
import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from 'vue';

import { SOURCE_END_ATTR, SOURCE_START_ATTR } from '../position/source-span';
import type { SourceRange } from '../position/types';

/**
 * 生テキストを見せたい範囲の配列を配る鍵。
 *
 * ref・getter・素の配列のいずれで渡してもよい（`toValue` で受ける）。注釈は増減するので、
 * 渡す側は普通 `computed` を置くことになる。
 */
export const SOURCE_SHOWN_KEY: InjectionKey<MaybeRefOrGetter<readonly SourceRange[]>> =
  Symbol('markdown:source-shown');

/**
 * 図に添えた生テキストの目印。
 *
 * この印の付いた要素の中身は、**フェンスの生テキストそのものではなく `pre.props.code`**
 * （タブを開き、器の前置きを剥がした後の文字列）である。位置の口を作る側は、この印を見たら
 * 文字数をそのまま数えず、`../position/fence.ts` の対応表を通すこと。要素が持つ
 * `data-src-start` / `data-src-end` はフェンス全体（開きのフェンスから閉じのフェンスまで）の
 * 範囲で、対応表を作る材料になる。
 */
export const FENCE_SOURCE_ATTR = 'data-fence-source';

/** 属性で届いた値を生テキストのオフセットとして読む。読めなければ `null` */
function readOffset(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * フェンス自身の生テキストの範囲を `$attrs` から読む。**無ければ `null`。**
 *
 * **MDC はフェンスの位置を素通ししない。** `keepPosition: true` を付けると AST の `pre` ノードに
 * `position` が乗るが、`MDCRenderer` が受け側へ渡すのは `node.props` だけで `node.position` は
 * 捨てられる（`propsToData`。実測 @nuxtjs/mdc 0.23.1）。そのため範囲は**属性として**渡って
 * くるほかない。名前は本文の包みと同じ `data-src-start` / `data-src-end` を使う
 * （`../position/source-span.ts`）。位置を DOM へ残す手当ては1か所にまとめておきたいので、
 * 別名を新たに作らない。
 *
 * 読めない場合（渡す側がまだ `pre` に印を付けていない場合を含む）は `null` を返し、
 * 呼ぶ側は「重なりを判断できない」＝図だけを出す側へ倒す。
 */
export function readFenceRange(attrs: Record<string, unknown>): SourceRange | null {
  const start = readOffset(attrs[SOURCE_START_ATTR]);
  const end = readOffset(attrs[SOURCE_END_ATTR]);
  if (start === null || end === null || start >= end) return null;
  return { start, end };
}

/** 2つの範囲が重なるか。端が触れているだけ（`a.end === b.start`）は重なりとしない */
function overlaps(a: SourceRange, b: SourceRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** provide が無いときの既定。**共有してよい**（読むだけで、書き換えない） */
const EMPTY_RANGES: readonly SourceRange[] = [];

/**
 * このフェンスに生テキストを添えるか。
 *
 * 渡された範囲が1つも重ならなければ偽。フェンス自身の範囲が読めないときも偽で、
 * **推測で添えない**（位置の口が「対応が取れなければ `null`」を返すのと同じ構え）。
 */
export function useSourceShown(fence: MaybeRefOrGetter<SourceRange | null>): ComputedRef<boolean> {
  const shown = inject(SOURCE_SHOWN_KEY, EMPTY_RANGES);

  return computed(() => {
    const range = toValue(fence);
    if (range === null) return false;
    return toValue(shown).some((wanted) => overlaps(wanted, range));
  });
}
