/**
 * フェンス（コードブロック）1つぶんの位置の対応表。
 *
 * **フェンスの中だけは、位置を自力で対応させるほかない。** 散文なら text ノードが
 * position を持つので生テキストの文字を数えられるが、フェンスの中の text ノードは
 * position を持たず、内側の `code` 要素はフェンス記号込みの `pre` と同じ範囲を指す
 * （`test/app/components/workspace/markdown-fence-position.test.ts`）。手掛かりは
 * 「`pre` の position（開きのフェンスから閉じのフェンスまで）」と「`pre.props.code`
 * （画面に出る文字列）」の2つしかなく、この2つは次の点で食い違う。
 *
 * - タブが **4桁のタブストップ**まで開かれる（「タブ→空白4つ」ではない。桁で増分が変わる）
 * - リストの中・引用の中では、器のインデントや `> ` が各行から落ちる
 * - 器のインデントを**剥がしてから**タブを開くので、生テキストの桁からは復元できない
 * - 最後の行に改行が無くても `code` には必ず足される
 * - 情報行（```` ```ts title="x" ````）のメタは `code` に入らず別の属性へ分かれる
 *
 * 救いは**行の並びが保たれる**ことである。position の切り出しから開き行と閉じ行を落とした
 * 行数は `code` の行数と常に一致し、行の増減も入れ替えも起きない。食い違うのは行の中の桁だけ。
 * だからこの対応表は**行ごとに**作り、行の中は「器の前置きを剥がす → タブを開く」という
 * 実物と同じ順序で桁を追う。
 *
 * DOM に触らない純関数として置く。面（`PositionPort` の実装）はこの表を引くだけにして、
 * 桁合わせの理屈を面ごとに持たない。
 *
 * 実測は @nuxtjs/mdc 0.23.1。差そのものは上記テストが固定しているので、パーサを上げて
 * 挙動が変わればあちらが先に落ちる。
 */
import type { SourceRange } from './types';

/** タブストップの幅。`detab` の既定（`node_modules/detab/index.js`）と同じ4 */
const TAB_SIZE = 4;

/** 画面に出る文字列の中の範囲。`start` は含み、`end` は含まない（UTF-16 の単位） */
export interface DisplayRange {
  start: number;
  end: number;
}

/** 対応表を作るための材料。すべて `pre` ノードと、それを解析した生テキストから取れる */
export interface FenceSource {
  /**
   * 生テキスト全体。
   *
   * **オフセットの基準に合わせたものを渡すこと。** `parseMarkdown` は CRLF を LF に潰し、
   * front matter を落としてから解析するので、位置はその後の本文を基準にする
   * （上記テストの「位置が取れない条件」）。生ファイルをそのまま渡すと切り出しがずれる。
   *
   * **ずれれば `null` になる、とは当てにしないこと。** 切り出しと画面の字がたまたま揃えば
   * 対応表は組み上がってしまう（`test/modules/markdown/runtime/position/edge-cases.test.ts`
   * が包みの側でその反例を固定している）。基準を揃えるのは呼ぶ側の責任である。
   */
  source: string;
  /**
   * `pre` ノードの position。
   *
   * **`undefined` になることがある。** 生テキストの先頭（offset 0）から始まる要素は
   * position を丸ごと落とす（`parser/compiler.js` の `node.position?.start?.offset && …`
   * が 0 を偽と見るため）。その場合は対応が取れないので `null` を返す。
   */
  position: SourceRange | undefined;
  /** `pre.props.code`。画面に出る文字列 */
  code: string;
}

/**
 * フェンス1つぶんの、表示と生テキストの相互の対応表。
 *
 * どちらの向きも「1文字 → 範囲」で答える。タブは表示では複数の空白に開くので、
 * 1つの生テキストの文字が表示の範囲に対応する。逆にタブが開いた空白はどれも
 * 同じ1つのタブを指す。
 */
export interface FenceMap {
  /** フェンス全体が占める生テキストの範囲（開きのフェンスから閉じのフェンスまで） */
  readonly sourceRange: SourceRange;
  /** 画面に出る文字列の長さ（UTF-16 の単位） */
  readonly displayLength: number;
  /**
   * 表示上の文字オフセット → 生テキストの範囲。
   *
   * `0` 以上 `displayLength` 以下を受ける。`displayLength`（末尾）は中身の終わりに潰した
   * 空の範囲を返す。範囲の外は `null`。
   *
   * 表示に出ていない生テキスト（開き行・閉じ行・剥がされた器の前置き）は表示側に
   * 対応する文字が無いので、この向きからは決して返らない。
   */
  toSourceRange(displayOffset: number): SourceRange | null;
  /**
   * 生テキストの位置 → 表示上の範囲。
   *
   * `sourceRange.start` 以上 `sourceRange.end` 以下を受ける。範囲の外は `null`。
   *
   * 表示に出ない文字（開き行・閉じ行・剥がされた器の前置き）は、**空の範囲**を返す。
   * 開き行はその行の表示位置（＝中身の先頭）へ、閉じ行は末尾へ潰す。長さ0で返すのは、
   * 「表示上の広がりを持たない」ことをそのまま表すため。
   */
  toDisplayRange(sourceOffset: number): DisplayRange | null;
}

/** 開きのフェンスの記号。同じ記号が同じ数以上並んだ行でなければ閉じにならない */
interface FenceMarker {
  char: string;
  length: number;
}

/** 行の先頭がフェンスの記号なら読む。そうでなければ `null` */
function readFenceMarker(line: string): FenceMarker | null {
  const matched = /^(`{3,}|~{3,})/.exec(line);
  if (!matched) return null;
  const marker = matched[1] ?? '';
  return { char: marker.slice(0, 1), length: marker.length };
}

/**
 * 閉じのフェンスの行か。
 *
 * 器の中では前に器の印（インデントや `> `）が残る。記号は開きと同じ種類で、
 * 開き以上の数が要る（CommonMark）。後ろは空白だけ許される。
 */
function isClosingLine(line: string, open: FenceMarker): boolean {
  const matched = /^[ \t>]*(`+|~+)[ \t]*$/.exec(line);
  if (!matched) return false;
  const marker = matched[1] ?? '';
  return marker.startsWith(open.char) && marker.length >= open.length;
}

/**
 * 1行のタブを開く。`detab`（mdc が `code` の値に掛けるもの）と同じ規則。
 *
 * **空白4つへの置換ではない。** 4桁のタブストップまでを埋めるので、桁によって増分が
 * 1〜4と変わる（`a\tb` は空白3つ、`ab\tc` は2つ、`abcd\te` は4つ）。桁は UTF-16 の
 * 単位で数える。`detab` が `index` と `value.length` で桁を進めているためで、
 * サロゲートペアは2桁と数える（実測: `𠮷\tx` → `𠮷` の後のタブは空白2つ）。
 *
 * @returns 開いた後の文字列と、元の文字1つ1つが表示で占める幅
 */
function expandTabs(line: string): { text: string; widths: number[] } {
  const widths: number[] = [];
  let text = '';
  let column = 0;

  for (const char of splitCodeUnits(line)) {
    const width = char === '\t' ? TAB_SIZE - (column % TAB_SIZE) : 1;
    widths.push(width);
    text += char === '\t' ? ' '.repeat(width) : char;
    column += width;
  }

  return { text, widths };
}

/** UTF-16 の単位で1つずつ。サロゲートペアを繋げない（オフセットの単位と揃えるため） */
function splitCodeUnits(value: string): string[] {
  const units: string[] = [];
  for (let index = 0; index < value.length; index += 1) units.push(value.slice(index, index + 1));
  return units;
}

/** 先頭から一致する文字数 */
function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

/**
 * 器の印を「継続行の形」に均す。
 *
 * 開き行が `- ```ts ` のようにリストの印と同じ行にあると、前置きは `- ` になる。
 * 中身の行に残るのは同じ幅の空白なので、`>` 以外を空白へ置き換えたものも候補に入れる。
 */
function asContinuation(prefix: string): string {
  return splitCodeUnits(prefix)
    .map((char) => (char === '>' || char === '\t' ? char : ' '))
    .join('');
}

/** 行頭に並ぶ「器になりうる文字」（空白・タブ・引用の `>`）の長さ */
function leadingContainerRun(line: string): number {
  return (/^[ \t>]*/.exec(line)?.[0] ?? '').length;
}

/**
 * その行から剥がされた前置きの長さの候補を、**確からしい順**に並べる。
 *
 * 順序が要るのは、剥がす量が違っても開いた後の文字列が同じになることがあるからである。
 * 例えば器のインデントが2の中の `  \tconst a = 1;` は、2文字剥がしてからタブを開いても
 * （空白4つ）、何も剥がさずに開いても（空白2つ＋タブの空白2つ）、どちらも
 * `    const a = 1;` になる。**正しいのは前者**（実測。器を剥がしてからタブを開く）なので、
 * 開き行の前に実際に在った前置きを最初に試す。
 */
function prefixCandidates(line: string, containerPrefix: string): number[] {
  const candidates: number[] = [];
  const seen = new Set<number>();
  const add = (length: number): void => {
    if (length < 0 || length > line.length || seen.has(length)) return;
    seen.add(length);
    candidates.push(length);
  };

  // 器がそのまま残っている行。器より浅い行（引用の中の空行 `>` など）も
  // 一致する分だけ剥がされるので、共通の長さを見る
  add(commonPrefixLength(line, containerPrefix));
  add(commonPrefixLength(line, asContinuation(containerPrefix)));
  // 手掛かりが外れたとき用。器になりうる文字の並びを深い側から試し、最後に総当たりする
  for (let length = leadingContainerRun(line); length >= 0; length -= 1) add(length);
  for (let length = 0; length <= line.length; length += 1) add(length);

  return candidates;
}

/**
 * その行から実際に剥がされた前置きの長さ。**推測ではなく照合で決める。**
 * 候補のうち「剥がしてタブを開いた結果が表示の行と一致する」最初のものを採る。
 * 一致するものが無ければ `null`（＝対応が取れない）。
 */
function choosePrefixLength(line: string, shown: string, containerPrefix: string): number | null {
  for (const length of prefixCandidates(line, containerPrefix)) {
    if (expandTabs(line.slice(length)).text === shown) return length;
  }
  return null;
}

/**
 * フェンス1つぶんの対応表を作る。**対応が取れなければ `null`。**
 *
 * 推測で返さない。`null` になるのは次の場合で、呼ぶ側は別の見せ方（生テキストを
 * そのまま出す、位置の口を閉じる）に倒す。
 *
 * 1. `position` が無い（生テキストの先頭から始まる要素）
 * 2. 4スペースのインデントコードブロック（フェンスの行が無く、開き行と閉じ行を落とす
 *    規則が通らない）
 * 3. オフセットの基準がずれている（CRLF や front matter を落とす前の生テキストを渡した）
 * 4. 行数が合わない、または行の中の桁を照合で合わせられない
 */
export function buildFenceMap({ source, position, code }: FenceSource): FenceMap | null {
  // 1. 先頭から始まる要素は position を持たない。
  //
  // **見るのは `position` が届いたかどうかだけである。** `!position.start` や
  // `!position?.start` と書いてはならない。`start` が 0 の位置——冒頭のフェンスを
  // 属性で受け取る面（`../render/MarkdownDiagram.vue`）では実在する——を「位置が無い」と
  // 取り違え、そこだけ黙って `null` になる（`test/modules/markdown/runtime/position/
  // silent-failure.test.ts` の「`start` が 0 の位置は「無い」ではない」。`!position?.start`
  // へ書き換えると4本落ちる。実測 2026-08-30）。
  //
  // 下の `!position` が正しいのは、`position` がオブジェクト（＝真）だからである。
  // **形に助けられているだけ**で、`SourceRange` を平坦な数（`positionStart` など）に
  // 開いた日には、同じ真偽判定が 0 を落とす。見るのは値の**有無**だけだと覚えておくこと
  if (!position) return null;

  const { start, end } = position;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end > source.length || start >= end) return null;

  const lines = source.slice(start, end).split('\n');

  // 2. 開き行がフェンスの記号で始まらないなら、フェンス記法ではない。
  // 4スペースのインデントコードブロックがこれで、position は中身だけを指すため
  // 切り出しは必ず4つ以上の空白（かタブ）から始まる。
  // **`language` では決められない。** インデントブロックは 'text' になるが、
  // 言語指定なしのフェンス（```` ``` ````）も 'text' になる（実測）ので、
  // 'text' を弾くと普通のフェンスまで落ちる。
  // 3. 基準のずれた生テキストを渡した場合も、切り出しが記号から始まらずここで落ちる
  const open = readFenceMarker(lines[0] ?? '');
  if (!open) return null;

  // 閉じの行がある（または未閉じでも末尾に改行がある）なら最後の行は中身ではない。
  // 未閉じで末尾に改行も無い場合だけ、最後の行まで中身になる
  const last = lines[lines.length - 1] ?? '';
  const closed = lines.length >= 2 && (last === '' || isClosingLine(last, open));
  const rawLines = closed ? lines.slice(1, -1) : lines.slice(1);

  // `code` は中身が空でなければ必ず改行で終わる（`detab(node.value + '\n')`）
  if (code !== '' && !code.endsWith('\n')) return null;
  const shownLines = code === '' ? [] : code.slice(0, -1).split('\n');

  // 4. 行の並びは保たれるはずなので、合わなければ対応が取れていない
  if (rawLines.length !== shownLines.length) return null;

  // 器の前置き。開き行の position は器のインデントの**後ろ**を指すので、
  // 行頭から position までがそのまま器の印になる（`  ` や `> ` や `>   `）
  const openLineStart = source.lastIndexOf('\n', start - 1) + 1;
  const containerPrefix = source.slice(openLineStart, start);

  const displayLength = code.length;
  const sourceByDisplay: (SourceRange | undefined)[] = new Array<SourceRange | undefined>(displayLength);
  const displayBySource: (DisplayRange | undefined)[] = new Array<DisplayRange | undefined>(end - start);

  /** 表示に出ない生テキストを、表示上の1点へ潰す */
  const collapse = (from: number, to: number, at: number): void => {
    for (let offset = from; offset < to; offset += 1) displayBySource[offset - start] = { start: at, end: at };
  };

  // 開き行（末尾の改行まで）は表示に出ない。中身の先頭へ潰す
  const contentStart = Math.min(start + (lines[0] ?? '').length + 1, end);
  collapse(start, contentStart, 0);

  let rawOffset = contentStart;
  let display = 0;

  for (let index = 0; index < rawLines.length; index += 1) {
    const raw = rawLines[index] ?? '';
    const shown = shownLines[index] ?? '';

    const prefixLength = choosePrefixLength(raw, shown, containerPrefix);
    if (prefixLength === null) return null;

    // 剥がされた器の印。表示に出ないので行頭へ潰す
    collapse(rawOffset, rawOffset + prefixLength, display);

    const { widths } = expandTabs(raw.slice(prefixLength));
    let column = display;
    for (let unit = 0; unit < widths.length; unit += 1) {
      const width = widths[unit] ?? 1;
      const at = rawOffset + prefixLength + unit;
      const range: SourceRange = { start: at, end: at + 1 };
      // タブが開いた空白はどれも同じ1つのタブを指す
      for (let step = 0; step < width; step += 1) sourceByDisplay[column + step] = range;
      displayBySource[at - start] = { start: column, end: column + width };
      column += width;
    }

    // 行末の改行。**生テキストに無いことがある**（未閉じで末尾に改行が無い場合）。
    // `code` には必ず足されるので、その1文字は生テキストの終わりへ潰して返す
    const newlineAt = rawOffset + raw.length;
    if (newlineAt < end) {
      sourceByDisplay[column] = { start: newlineAt, end: newlineAt + 1 };
      displayBySource[newlineAt - start] = { start: column, end: column + 1 };
    } else {
      sourceByDisplay[column] = { start: end, end: end };
    }

    display = column + 1;
    rawOffset = newlineAt + 1;
  }

  if (display !== displayLength) return null;

  // 閉じ行は表示に出ない。末尾へ潰す
  const contentEnd = Math.min(rawOffset, end);
  collapse(contentEnd, end, displayLength);

  return {
    sourceRange: { start, end },
    displayLength,

    toSourceRange(displayOffset: number): SourceRange | null {
      if (!Number.isInteger(displayOffset)) return null;
      if (displayOffset < 0 || displayOffset > displayLength) return null;
      if (displayOffset === displayLength) return { start: contentEnd, end: contentEnd };
      const range = sourceByDisplay[displayOffset];
      return range ? { ...range } : null;
    },

    toDisplayRange(sourceOffset: number): DisplayRange | null {
      if (!Number.isInteger(sourceOffset)) return null;
      if (sourceOffset < start || sourceOffset > end) return null;
      if (sourceOffset === end) return { start: displayLength, end: displayLength };
      const range = displayBySource[sourceOffset - start];
      return range ? { ...range } : null;
    },
  };
}
