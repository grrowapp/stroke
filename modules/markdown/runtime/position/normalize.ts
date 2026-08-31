/**
 * 渡された文字列と、`parseMarkdown` が実際に解析する文字列との写像。
 *
 * **なぜ要るか。** `parseMarkdown` は解析の前に文字列を2段階で作り変える —
 * CRLF を LF へ潰し、front matter を落とす。DOM に出る位置の印
 * （`./source-span.ts` の `data-src-*`）は**作り変えた後**の文字列を指す。
 * 一方、面へ渡されるのは本家から取得したままの文字列である。基準が2つに割れる。
 *
 * 揃えなければ、位置は `null` に倒れず**黙って別の場所を返す**（実測: 本文の `b` を
 * 選ぶと front matter の `b` が返る）。揃える責任は面の内側にある
 * （`openspec/specs/markdown/module` の「面は解析のための正規化を自分で吸収する」）。
 *
 * **文法を自前で書かない。** front matter を落とすのは `parseMarkdown` が呼ぶのと
 * 同じ `parseFrontMatter`（`remark-mdc`）である。自前で書けば同じ結果になる保証が無く、
 * 食い違ったときに黙って誤った位置を返す side に倒れる。
 *
 * **`remark-mdc` は `package.json` に無い推移的依存である。** `@nuxtjs/mdc` が
 * 依存を落とせば解決できなくなる。直接依存に足さないのは、版が別々に動くと
 * 「解析する側と同じものを呼ぶ」という前提が崩れるためである。消えた場合は
 * 写像を作れず `null` に倒れる（黙って誤らない）。
 *
 * 実測は @nuxtjs/mdc 0.23.1 / remark-mdc 同梱版。
 */
import { parseFrontMatter } from 'remark-mdc';

import type { SourceRange } from './types';

/**
 * 渡された文字列と解析される文字列の対応。
 *
 * `parsed` が解析に使われる文字列で、位置の印はこれを指す。両方向の変換を持つ。
 */
export interface SourceMapping {
  /** 解析に使われる文字列。位置の印（`data-src-*`）が指すのはこちら */
  readonly parsed: string;
  /** 解析側の位置 → 渡された文字列の位置。対応が取れなければ `null` */
  toGiven(range: SourceRange): SourceRange | null;
  /** 渡された文字列の位置 → 解析側の位置。対応が取れなければ `null` */
  toParsed(range: SourceRange): SourceRange | null;
}

/**
 * `\r\n` のたびに1文字ぶん詰まる。並びは変わらないので、累積のずれを1本持てば足りる。
 *
 * `shift[i]` は「LF 側の i 文字目が、渡された文字列では `i + shift[i]` 文字目」を表す。
 * 長さは LF 側の長さ + 1（末尾の位置も指せるようにする）。
 */
function crlfShift(given: string): { lf: string; shift: readonly number[] } {
  const lf: string[] = [];
  const shift: number[] = [];
  let dropped = 0;

  for (let i = 0; i < given.length; i += 1) {
    if (given[i] === '\r' && given[i + 1] === '\n') {
      dropped += 1;
      continue;
    }
    shift.push(dropped);
    lf.push(given[i]!);
  }
  shift.push(dropped);

  return { lf: lf.join(''), shift };
}

/** 範囲が `0 <= start <= end <= length` かつ整数であること */
function isSane(range: SourceRange, length: number): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end >= range.start &&
    range.end <= length
  );
}

/**
 * 写像を作る。作れなければ `null`。
 *
 * **作れないときに恒等で代用しない。** 代用すると基準の違う位置を正しいかのように
 * 返すことになり、この写像が塞ごうとしている症状そのものになる。
 *
 * **同期である。** `parseFrontMatter` は Promise を返さない（`remark-mdc/dist/index.mjs:48`
 * が素の関数）。面はポートを呼ばれるたびに同期で作るので、ここが非同期になると
 * その形を崩すことになる。
 */
export function createSourceMapping(given: string): SourceMapping | null {
  const { lf, shift } = crlfShift(given);

  let parsed: string;
  try {
    ({ content: parsed } = parseFrontMatter(lf));
  } catch {
    // 依存が消えた・文法が変わった。推測で埋めない
    return null;
  }

  if (typeof parsed !== 'string') return null;

  /**
   * **接尾辞であることを必ず確かめる。**
   *
   * 実測（tasks 1.3）では7通りすべてで接尾辞だった。front matter は先頭からしか
   * 落ちないので、落ちた量は定数 `lf.length - parsed.length` で表せる。
   * この前提が崩れる版に当たったら、写像を作らずに `null` へ倒す。
   */
  if (!lf.endsWith(parsed)) return null;

  const front = lf.length - parsed.length;

  /**
   * **範囲は半開区間なので、終わりは「直前の文字の終わり」へ写す。**
   *
   * 素直に `end` の位置を写すと、落とされた `\r` を巻き込む。`x\r\n` で `x` を選ぶと
   * LF 側の終わり（`\n` の位置）が渡された側では `\r` の後ろを指し、範囲が `x\r` に
   * なる（実測。この形で1本落ちた）。
   */
  const toGiven = (range: SourceRange): SourceRange | null => {
    if (!isSane(range, parsed.length)) return null;

    const at = (lfOffset: number): number | null =>
      lfOffset < shift.length ? lfOffset + shift[lfOffset]! : null;

    const start = at(range.start + front);
    if (start === null) return null;

    if (range.end === range.start) return { start, end: start };

    const last = at(range.end + front - 1);
    if (last === null) return null;
    return { start, end: last + 1 };
  };

  const toParsed = (range: SourceRange): SourceRange | null => {
    if (!isSane(range, given.length)) return null;

    // 渡された側 → LF 側は、`shift` の逆引き。単調増加なので前から走らせる
    const back = (offset: number): number | null => {
      for (let i = 0; i < shift.length; i += 1) {
        if (i + shift[i]! === offset) return i;
      }
      return null;
    };

    const lfStart = back(range.start);
    // `\r` の上を指している。LF 側に対応する位置が無い
    if (lfStart === null) return null;

    const start = lfStart - front;
    // 落とされた前置きの中を指している
    if (start < 0) return null;

    if (range.end === range.start) return { start, end: start };

    // 終わりも「直前の文字の終わり」で読む（`toGiven` と対称）
    const lfLast = back(range.end - 1);
    if (lfLast === null) return null;

    const end = lfLast - front + 1;
    if (end < 0) return null;

    return { start, end };
  };

  return { parsed, toGiven, toParsed };
}
