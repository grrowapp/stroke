/**
 * 生テキストの面（`../render/MarkdownSource.vue`）のための位置の口。
 *
 * この面は生テキストをそのまま並べるだけなので、**文字の対応は恒等**である。整形された
 * 本文の面（`./source-span.ts`）やフェンス（`./fence.ts`）のような桁合わせは要らない。
 *
 * **恒等なのは文字の対応だけで、`Range` の扱いは素通しにならない。** `Range` の端は
 * 「ノードとその中のオフセット」で表され、同じ位置でも表し方が1つに定まらないからである。
 *
 * - 端が text ノードなら、オフセットはその text ノードの中の文字数。器の先頭からの
 *   文字数ではないので、**その text ノードが器の中のどこから始まるか**を足す必要がある
 * - 端が要素なら、オフセットは**子ノードの番号**であって文字数ではない。
 *   `selectNodeContents()` で全体を選ぶとこの形になる（器そのものと子の数）
 * - 面の中の text ノードが必ず1つとは限らない。Vue の描き直しやハイドレーションで
 *   分かれることがあり、「1つ目の text ノードの中の位置」と決め打つと壊れる
 *
 * そこで器の中を走査して、ノード1つ1つが器の先頭から数えて何文字目から何文字目までかを
 * 出し、その表を引いて端を文字数へ落とす。走査は呼ばれるたびに行う。面は描き直されるので、
 * 作った時点の DOM を覚えると古い表を引くことになる。
 *
 * DOM を読むだけで書き換えない。面（`PositionPort` の実装）が持つのは器と生テキストの
 * 2つだけで、注釈のことは知らない。
 */
import type { PositionPort, SourceRange } from './types';

/**
 * text ノードの `nodeType`。
 *
 * `Node.TEXT_NODE` を使わないのは、この定数がグローバルの `Node` に生えているためである。
 * サーバー側では `Node` が無いので、参照した時点で落ちる。
 */
const TEXT_NODE = 3;

/** 面の材料 */
export interface PlainSurface {
  /**
   * 生テキストを入れてある器。この中の text ノードを前から繋いだものが面の文字列になる。
   *
   * 器そのものも範囲の端になりうる（`selectNodeContents()`）ので、走査に含める。
   */
  container: Node;
  /**
   * 面に渡した生テキスト。
   *
   * **器の文字列と同じでなければならない。** 違っていれば恒等の前提が崩れているので、
   * 口は黙って通さずに `null` を返す（`toSourceRange` の説明を見ること）。
   */
  source: string;
}

/** ノードが器の先頭から数えて占める文字の範囲 */
interface Span {
  start: number;
  end: number;
}

/** 器の中の text ノード1つ */
interface Piece {
  node: Text;
  start: number;
  end: number;
}

/** 器を走査した結果 */
interface Scan {
  /** 器の中の text ノードを前から繋いだ文字列 */
  text: string;
  /** 器とその中のノードすべての範囲。ここに無いノードは器の外 */
  spans: Map<Node, Span>;
  /** text ノードを前から順に */
  pieces: Piece[];
}

/** 器の中を文書の順に辿り、ノードごとの範囲を出す */
function scan(container: Node): Scan {
  const spans = new Map<Node, Span>();
  const pieces: Piece[] = [];
  let text = '';

  const visit = (node: Node): void => {
    const start = text.length;

    if (node.nodeType === TEXT_NODE) {
      const value = (node as Text).data;
      text += value;
      pieces.push({ node: node as Text, start, end: start + value.length });
    } else {
      // コメント（`<!--v-if-->` など）は文字を持たないので、幅0の範囲になる
      for (const child of Array.from(node.childNodes)) visit(child);
    }

    spans.set(node, { start, end: text.length });
  };

  visit(container);
  return { text, spans, pieces };
}

/** `Range` の端（ノードとオフセット）を、器の先頭からの文字数へ。器の外や範囲外は `null` */
function offsetOfBoundary(scanned: Scan, node: Node, offset: number): number | null {
  if (!Number.isInteger(offset) || offset < 0) return null;

  const span = scanned.spans.get(node);
  // 表に無い＝器の外を指している
  if (!span) return null;

  if (node.nodeType === TEXT_NODE) {
    // text ノードのオフセットは、そのノードの中の文字数（UTF-16 の単位）
    if (offset > (node as Text).data.length) return null;
    return span.start + offset;
  }

  // 要素のオフセットは子ノードの番号。番号ぶんの子の**手前**が端になる
  const children = node.childNodes;
  if (offset > children.length) return null;
  if (offset === children.length) return span.end;

  const child: ChildNode | undefined = children[offset];
  const childSpan = child ? scanned.spans.get(child) : undefined;
  return childSpan ? childSpan.start : null;
}

/**
 * 器の先頭からの文字数を、`Range` に渡せる端へ。
 *
 * text ノードの継ぎ目に当たる位置は、前のノードの末尾とも次のノードの先頭とも書ける。
 * 範囲の始まりは後ろ寄り（次のノードの先頭）、終わりは前寄り（前のノードの末尾）に採る。
 * こうすると範囲の中に空の端が挟まらず、選択の見え方が実際の文字と揃う。
 */
function boundaryOfOffset(
  scanned: Scan,
  container: Node,
  offset: number,
  side: 'start' | 'end',
): { node: Node; offset: number } | null {
  // text ノードが1つも無い（中身が空の面）。器の頭を指すほかない
  if (scanned.pieces.length === 0) return offset === 0 ? { node: container, offset: 0 } : null;

  for (const piece of scanned.pieces) {
    const inside = side === 'start' ? offset < piece.end : offset <= piece.end;
    if (inside) return offset < piece.start ? null : { node: piece.node, offset: offset - piece.start };
  }

  // 末尾。始まり側はどの text ノードの内側にも入らないので、最後のノードの末尾へ
  const last = scanned.pieces[scanned.pieces.length - 1];
  if (!last || offset !== last.end) return null;
  return { node: last.node, offset: last.end - last.start };
}

/**
 * 生テキストの面の位置の口を作る。
 *
 * 両方向とも、次の場合に `null` を返す。**推測で返さない。**
 *
 * 1. 器の文字列が渡された生テキストと違う（恒等の前提が崩れている）
 * 2. `Range` の端が器の外を指している
 * 3. `Range` の端のオフセットがそのノードの範囲を超えている
 * 4. 生テキストの範囲が `0` 以上 `source.length` 以下に収まらない、または整数でない
 * 5. `start` が `end` より後ろ
 *
 * 1 は起こりうる。器は `<pre>` なので、生テキストが改行で始まると SSR の HTML を
 * 解析した時点でその1文字が落ちる（`<pre>` の直後の改行は HTML の規則で捨てられる）。
 * 落ちたまま恒等で答えると、以降の位置が1つずつずれた値を黙って返すことになる。
 */
export function createPlainPositionPort({ container, source }: PlainSurface): PositionPort {
  /** 器を走査し、恒等の前提が立っているときだけ結果を返す */
  const scanIfIdentical = (): Scan | null => {
    const scanned = scan(container);
    return scanned.text === source ? scanned : null;
  };

  return {
    toSourceRange(range: Range): SourceRange | null {
      const scanned = scanIfIdentical();
      if (!scanned) return null;

      const start = offsetOfBoundary(scanned, range.startContainer, range.startOffset);
      const end = offsetOfBoundary(scanned, range.endContainer, range.endOffset);
      if (start === null || end === null || start > end) return null;

      return { start, end };
    },

    toDomRange({ start, end }: SourceRange): Range | null {
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
      if (start < 0 || end > source.length || start > end) return null;

      const scanned = scanIfIdentical();
      if (!scanned) return null;

      const document = container.ownerDocument;
      if (!document) return null;

      const from = boundaryOfOffset(scanned, container, start, 'start');
      const to = boundaryOfOffset(scanned, container, end, 'end');
      if (!from || !to) return null;

      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range;
    },
  };
}
