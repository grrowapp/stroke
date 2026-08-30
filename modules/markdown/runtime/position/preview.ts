/**
 * 整形された本文の面（`../render/MarkdownView.vue`）のための位置の口。
 *
 * 面の DOM は `./source-span.ts` が作る。text ノードが `<span data-src-start data-src-end>`
 * で包まれていて、包みの中の字が生テキストのどこに当たるかはその属性から引ける。
 * **包みの外には対応が無い。** markdown の記号（`**` や `- `）、コードブロックの言語名の札、
 * 図（mermaid）が描いた SVG は、画面には出ていても生テキストの字と1対1に並ばない。
 *
 * だから面の中で見るものは3つしかない。
 *
 * 1. **包み**（`span[data-src-start]`）……散文。属性の範囲と包みの中の字を突き合わせる
 * 2. **フェンス**（`pre`）……包みが無い。`./fence.ts` の対応表を通す
 * 3. **それ以外**……対応が無い。`null` の材料になる
 *
 * 対応の取れた一続きだけを面の軸（器の中の text ノードを前から繋いだ文字の並び）の上に
 * 並べ、選択された範囲がそのどれとどれだけ重なるかで答える。**重ならなければ `null`**。
 * 図の中を指したときや、言語名の札だけを選んだときがこれに当たる。
 *
 * **この面が踏む地雷は2つある。どちらも「照合で決める」ことで避ける。**
 *
 * - 包みの中の文字数と、包みの指す生テキストの長さは一致しないことがある（インラインコード）。
 *   差を按分せず、中の字が範囲のどこに在るかを探す（`alignWrapper`）
 * - フェンスの位置と `code` は DOM に出ていない。生テキストの側から候補を出し、
 *   `./fence.ts` の `buildFenceMap` が桁まで照合できたものだけを採る（`scanFencedBlocks`）
 *
 * DOM を読むだけで書き換えない。走査は呼ばれるたびに行う（面は描き直される。`./plain.ts`
 * と同じ理由）。生テキストは作った時点で決まるので、そちらから作る材料だけは控えておく。
 */
import { buildFenceMap, type FenceMap } from './fence';
import { createSourceMapping } from './normalize';
import { SOURCE_END_ATTR, SOURCE_START_ATTR } from './source-span';
import type { PositionPort, SourceRange } from './types';

/**
 * text ノードの `nodeType`。
 *
 * `Node.TEXT_NODE` を使わないのは、この定数がグローバルの `Node` に生えているためである。
 * サーバー側では `Node` が無いので、参照した時点で落ちる（`./plain.ts` と同じ）。
 */
const TEXT_NODE = 3;

/** 要素の `nodeType` */
const ELEMENT_NODE = 1;

/** フェンスが描かれる要素のタグ。`../render/MarkdownCode.vue` も図の添え書きも `pre` で出す */
const FENCE_TAG = 'PRE';

/** 面の材料 */
export interface PreviewSurface {
  /**
   * 整形された本文を入れてある器。この中の text ノードを前から繋いだものが面の文字列になる。
   *
   * 器そのものも範囲の端になりうる（`selectNodeContents()`）ので、走査に含める。
   */
  container: Node;
  /**
   * その本文のもとになった生テキスト。**面に渡された、そのままの文字列でよい。**
   *
   * `parseMarkdown` は解析の前に CRLF を LF へ潰し、front matter を落とす
   * （`@nuxtjs/mdc/dist/runtime/parser/index.js` の `md.replace(/\r\n/g, "\n")` と
   * `parseFrontMatter`）。DOM に出る位置の印はその**後**の文字列を指すので、
   * 渡された文字列とは基準が割れる。
   *
   * **その食い違いは面が自分で吸収する。** 揃えてから渡す手続きを呼ぶ側に課さない
   * （`openspec/specs/markdown/module` の「面は解析のための正規化を自分で吸収する」）。
   * 揃え忘れは実行時に何の合図も出さず、誤った位置が返るだけになるためである。
   *
   * 返る位置も、外から渡す位置も、**この文字列を基準に読む**。写像は
   * `./normalize.ts` が作り、作れなければ両方向とも `null` になる（推測で答えない）。
   *
   * 本家の文書は人間も別のエージェントも書ける平文の md なので、CRLF も front matter も
   * 現実に来る。「来ない前提」で済ませてよい入力ではない。
   */
  source: string;
}

/** ノードが面の先頭から数えて占める文字の範囲 */
interface Span {
  start: number;
  end: number;
}

/** 面の中の text ノード1つ */
interface TextPiece {
  node: Text;
  start: number;
  end: number;
}

/**
 * 面の文字の並びのうち、生テキストと対応が取れている一続き。
 *
 * 包み1つ、フェンス1つがそれぞれ1つになる。**一続きどうしは重ならない**（包みは入れ子に
 * ならず、フェンスの中に包みは無い）ので、面の軸の上で前から並べられる。
 */
interface Mapped {
  /** 面の先頭から数えた範囲 */
  start: number;
  end: number;
  /** この一続きが覆う生テキストの範囲 */
  source: SourceRange;
  /** 面の位置 → 生テキストの位置。引けなければ `null` */
  toSource(offset: number): number | null;
  /** 生テキストの位置 → 面の位置。引けなければ `null` */
  toOffset(at: number): number | null;
}

/** 器を走査した結果 */
interface Scan {
  /** 器とその中のノードすべての範囲。ここに無いノードは器の外 */
  spans: Map<Node, Span>;
  /** text ノードを前から順に */
  texts: TextPiece[];
  /** 対応の取れた一続きを前から順に */
  mapped: Mapped[];
}

/** 生テキストの中のフェンス1つぶんの範囲（開きのフェンスから閉じのフェンスまで） */
interface Fenced {
  start: number;
  end: number;
}

/**
 * 属性で届いた値を生テキストのオフセットとして読む。読めなければ `null`。
 *
 * **空の属性は 0 ではない。** `Number('')` も `Number(' ')` も `0` になるので、
 * 数だけを見るガード（`Number.isInteger(parsed) && parsed >= 0`）はこれを素通しする。
 * `data-src-start=""` が有効なオフセット 0 として読まれると、その包みは文書の冒頭を
 * 指したまま黙って通る——「位置が無い」と「offset 0」の取り違えそのものである
 * （`./source-span.ts` の「位置を持たない text ノードは包まない」）。
 */
function readOffset(value: string | null): number | null {
  if (value === null) return null;
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** 包みが持つ生テキストの範囲。持っていなければ（＝包みでなければ）`null` */
function readWrapperRange(element: Element, source: string): SourceRange | null {
  const start = readOffset(element.getAttribute(SOURCE_START_ATTR));
  const end = readOffset(element.getAttribute(SOURCE_END_ATTR));
  if (start === null || end === null) return null;
  if (start > end || end > source.length) return null;
  return { start, end };
}

/**
 * 包みの中の字が、生テキストのどこから始まるか。**照合で決める。**
 *
 * **包みの中の文字数と、属性が指す範囲の長さは一致しないことがある。** `**強調**` は
 * どちらも記号の内側で揃うが、`` `インラインコード` `` は中身が記号を含まないのに範囲は
 * 記号を含む（実測。`./source-span.ts` の「包みの中身と、その位置が指す生テキストは…」）。
 *
 * **長さの差を按分してはならない。** 差は記号のぶんであって、中の字に均されるものではない。
 * 按分すると、インラインコードの中を選んだときに1〜2文字ずれた位置を黙って返すことになる。
 * どの記法で差が出るかの実測表は
 * `test/modules/markdown/runtime/position/silent-failure.test.ts` にある。
 * そこで「中の字が範囲の中のどこに在るか」を探し、見つかった位置を頭に採る。記号は前後に
 * 同じ数だけ付く（`` ` `` も `` `` `` も、CommonMark が剥がす前後1つの空白も）ので中央を
 * 先に試し、外れたら前から探す。
 *
 * @returns 範囲の頭から数えた、中の字の始まる位置。見つからなければ `null`
 */
function alignWrapper(slice: string, text: string): number | null {
  if (slice === text) return 0;

  const delta = slice.length - text.length;
  // 中の字のほうが長い。包みと範囲が別のものを指している
  if (delta < 0) return null;

  // 記号は前後に同じ数だけ付く。まず中央を試す
  if (delta % 2 === 0 && slice.startsWith(text, delta / 2)) return delta / 2;

  // 見つからない場合がある。エスケープ（`\*` → `*`）や実体参照（`&amp;` → `&`）は、
  // 描かれた字が生テキストにその形で無い。どの字がどこから来たかを言えないので、
  // その包みは対応の取れない領域として扱う（**推測で返さない**）
  const at = slice.indexOf(text);
  return at < 0 ? null : at;
}

/** 行の先頭と、その行が生テキストの何文字目から始まるか */
function splitLines(source: string): { text: string; start: number }[] {
  const lines: { text: string; start: number }[] = [];
  let start = 0;

  for (;;) {
    const at = source.indexOf('\n', start);
    if (at < 0) {
      lines.push({ text: source.slice(start), start });
      return lines;
    }
    lines.push({ text: source.slice(start, at), start });
    start = at + 1;
  }
}

/** 開きのフェンスの記号。同じ記号が同じ数以上並んだ行でなければ閉じにならない */
interface FenceMarker {
  /** 行頭から記号までの文字数（器の印のぶん）。`pre` の position はここを指す */
  offset: number;
  char: string;
  length: number;
}

/**
 * 行がフェンスを開いていれば読む。そうでなければ `null`。
 *
 * 器の印（インデント・引用の `>`・箇条書きの印）は記号の前に立つ。`pre` の position は
 * その**後ろ**を指すので（`./fence.ts` の `containerPrefix`）、記号までの文字数も返す。
 */
function readOpenFence(line: string): FenceMarker | null {
  const matched = /^([ \t>]*(?:[-*+][ \t]+|\d{1,9}[.)][ \t]+)?[ \t>]*)(`{3,}|~{3,})/.exec(line);
  if (!matched) return null;
  const prefix = matched[1] ?? '';
  const marker = matched[2] ?? '';
  return { offset: prefix.length, char: marker.slice(0, 1), length: marker.length };
}

/** 閉じのフェンスの行か。判定は `./fence.ts` の同名の関数と同じ規則（CommonMark） */
function isClosingFence(line: string, open: FenceMarker): boolean {
  const matched = /^[ \t>]*(`+|~+)[ \t]*$/.exec(line);
  if (!matched) return false;
  const marker = matched[1] ?? '';
  return marker.startsWith(open.char) && marker.length >= open.length;
}

/**
 * 生テキストの中のフェンスを前から並べる。
 *
 * **フェンスの位置が DOM に出ない `pre` が残っているので、これが要る。**
 *
 * 印は `../position/source-span.ts` が `pre` の props へ載せ、`MarkdownCode` の
 * `v-bind="attrs"` から属性として出る。だから普段はここを通らない。通るのは
 * **生テキストの先頭（offset 0）から始まるフェンス**、つまり文書がフェンスで始まる場合
 * だけである。`@nuxtjs/mdc` は position を真偽で拾うので
 * （`dist/runtime/parser/compiler.js` の
 * `node.position?.start?.offset && node.position?.end?.offset ? … : void 0`）、
 * `start.offset` が `0` のノードは position を落とす。position の無いノードに印は打てない
 * （打てば「対応が取れない」を言えなくなる）ので、この `pre` は印を持ちようがない。
 *
 * front matter を落とした後の本文は区切りの改行が1つ残るため、front matter の直後の
 * フェンスは offset 0 にならない。**印が落ちる条件はこの1つに尽きる。**
 *
 * **黙ってここへ落ちることはない。** 印が有れば `resolveFence` はその範囲しか試さず、
 * 合わなければ `null` を返す（生テキストの側を探し直さない）。どちらの経路を通ったかは
 * `pre` の印の有無だけで決まり、その境目は
 * `test/modules/markdown/runtime/position/edge-cases.test.ts` が固定している。
 *
 * **これは候補を出すだけで、決めるのは `buildFenceMap` である。** 出した範囲と `pre` の中の
 * 字が桁まで合ったものだけを採るので、行の読み違いは対応表が作れないという形で落ちる。
 */
function scanFencedBlocks(source: string): Fenced[] {
  const blocks: Fenced[] = [];
  const lines = splitLines(source);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const open = line ? readOpenFence(line.text) : null;
    if (!line || !open) {
      index += 1;
      continue;
    }

    let closing = -1;
    for (let ahead = index + 1; ahead < lines.length; ahead += 1) {
      if (isClosingFence(lines[ahead]?.text ?? '', open)) {
        closing = ahead;
        break;
      }
    }

    // 閉じの行があればその行の終わりまで、無ければ生テキストの終わりまで（実測。
    // `test/app/components/workspace/markdown-fence-position.test.ts` の「閉じのフェンスが
    // 無いときは、そこまでの範囲を指す」）
    const last = closing < 0 ? undefined : lines[closing];
    blocks.push({ start: line.start + open.offset, end: last ? last.start + last.text.length : source.length });
    index = closing < 0 ? lines.length : closing + 1;
  }

  return blocks;
}

/**
 * `pre` の中の字から、対応表の材料になる `code` の候補を出す。
 *
 * **画面に出ている字は `code` そのものではない。** 描く側が末尾を落とすからである
 * （`../render/MarkdownCode.vue` の `code.trimEnd()`。shiki を通る場合も
 * `codeToHast(code.trimEnd())` で同じ）。落ちるのは末尾だけなので、行の数から
 * 足し直せる本数が決まる。
 *
 * - 閉じの行がある場合……中身は切り出しの行数 − 2
 * - 閉じの行が無い場合……中身は切り出しの行数 − 1
 *
 * どちらかは `buildFenceMap` が桁まで照合して決めるので、両方を候補に入れて渡す。
 * 図に添えた生テキスト（`../render/MarkdownDiagram.vue`）のように末尾が落ちていない
 * 面もあるので、そのままの字も候補に入れる。
 *
 * **末尾の空白は戻せない。** 最後の行が空白で終わるフェンスは、その空白が画面に出て
 * いないので候補を組み立てられず、対応表が作れない（＝そのフェンスは `null` になる）。
 * 見えていない字をでっち上げるより、対応が取れないと答えるほうを採る。
 */
function codeCandidates(slice: string, text: string): string[] {
  const lines = slice.split('\n').length;
  const shown = text.split('\n').length;
  const candidates = [text];

  for (const count of [lines - 1 - shown, lines - shown]) {
    if (count < 1) continue;
    const candidate = text + '\n'.repeat(count);
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }

  return candidates;
}

/** 包み1つぶん（と、先頭で拾い直した字）の対応。生テキストと1対1に並ぶ */
function wrapperPiece(start: number, end: number, at: number): Mapped {
  const source: SourceRange = { start: at, end: at + (end - start) };
  return {
    start,
    end,
    source,
    toSource: (offset: number): number => at + (offset - start),
    toOffset: (position: number): number => start + (position - at),
  };
}

/** フェンス1つぶんの対応。桁合わせは `./fence.ts` の対応表に任せる */
function fencePiece(start: number, end: number, map: FenceMap): Mapped {
  return {
    start,
    end,
    source: map.sourceRange,
    toSource(offset: number): number | null {
      // 1文字が生テキストの範囲に対応する（タブは開いた空白のぶんだけ広がる）。
      // 端としては頭を採る。範囲は `start` を含み `end` を含まないので、
      // 始まりでも終わりでもこれで辻褄が合う
      return map.toSourceRange(offset - start)?.start ?? null;
    },
    toOffset(position: number): number | null {
      const display = map.toDisplayRange(position);
      if (!display) return null;
      // 末尾の落ちた空白を指している場合、表示の位置は画面に出ている字より後ろになる。
      // 画面の端へ寄せる（そこから先には指せる字が無い）
      return Math.min(start + display.start, end);
    },
  };
}

/** 走査の途中で見つけた、まだ位置の決まっていないフェンス */
interface PendingFence {
  kind: 'fence';
  start: number;
  end: number;
  /** 属性で届いた範囲。無ければ生テキストの側から探す */
  position: SourceRange | null;
}

/** 走査の途中の一続き。どちらも面の先頭から数えた始まりを持つ（文書の順に並ぶ） */
type Entry = { kind: 'mapped'; start: number; piece: Mapped } | PendingFence;

/**
 * 整形された本文の面の位置の口を作る。
 *
 * 両方向とも、次の場合に `null` を返す。**推測で返さない。**
 *
 * 1. `Range` の端が器の外を指している、またはオフセットがノードの範囲を超えている
 * 2. 選んだ範囲が、対応の取れた一続きと1文字も重ならない（図の中、言語名の札、要素の隙間）
 * 3. 包みの中の字が、包みの指す生テキストの中に見つからない（エスケープ・実体参照）
 * 4. フェンスの対応表が作れない（`./fence.ts` の `buildFenceMap` が `null`）
 * 5. 生テキストの範囲が `0` 以上 `source.length` 以下に収まらない、または整数でない
 * 6. 生テキストの範囲に当たる字が面に1つも無い（`toDomRange`）
 */
export function createPreviewPositionPort({
  container,
  source: given,
}: PreviewSurface): PositionPort {
  /**
   * 渡された文字列と、解析に使われた文字列との写像。
   *
   * **この関数の中はすべて解析側の座標で動く。** 位置の印（`data-src-*`）も、フェンスの
   * 対応表も、照合もその基準だからである。渡された文字列の座標へ戻すのは、外へ答える
   * 直前の1箇所だけにする（`toSourceRange` の出口・`toDomRange` の入口）。
   *
   * **写像が作れなければ両方向とも `null` を返す。** 恒等で代用しない。代用すると
   * 基準の違う位置を正しいかのように返すことになり、塞ごうとしている症状そのものになる。
   */
  const mapping = createSourceMapping(given);
  const source = mapping?.parsed ?? '';

  /** 生テキストは作った時点で決まるので、フェンスの候補は1度出せばよい */
  const blocks = scanFencedBlocks(source);

  /**
   * 作った対応表の控え。
   *
   * 口は選択のたびに呼ばれ、そのたびに器を走査し直す。生テキストと `pre` の中の字が
   * 同じなら対応表も同じなので、作り直さない（対応表は生テキストの長さぶんの配列を
   * 2つ持つ）。作れなかったこと（`null`）も控える。
   */
  const built = new Map<string, FenceMap | null>();

  const fenceMapOf = (position: SourceRange, code: string): FenceMap | null => {
    const key = `${position.start}:${position.end}:${code}`;
    const cached = built.get(key);
    if (cached !== undefined) return cached;

    const map = buildFenceMap({ source, position, code });
    built.set(key, map);
    return map;
  };

  /**
   * フェンス1つを解く。位置が届いていなければ、`after` より後ろの候補を前から試す。
   *
   * **経路は `pending.position` の有無で決まる。** 有れば印の経路（1つだけ試す）、無ければ
   * 走査の経路（候補を前から試す）。印が有って合わないときに走査へ移ることはしない
   * （`scanFencedBlocks` の説明）。
   */
  const resolveFence = (pending: PendingFence, text: string, after: number): FenceMap | null => {
    const positions = pending.position
      ? [pending.position]
      : blocks.filter((block) => block.start >= after);

    for (const position of positions) {
      for (const code of codeCandidates(source.slice(position.start, position.end), text)) {
        const map = fenceMapOf(position, code);
        if (map) return map;
      }
    }
    return null;
  };

  /** 器の中を文書の順に辿り、ノードごとの範囲と、対応の取れた一続きを出す */
  const scan = (): Scan => {
    const spans = new Map<Node, Span>();
    const texts: TextPiece[] = [];
    const entries: Entry[] = [];
    let length = 0;

    const visit = (node: Node, insideFence: boolean): void => {
      const start = length;

      if (node.nodeType === TEXT_NODE) {
        const value = (node as Text).data;
        length += value.length;
        texts.push({ node: node as Text, start, end: length });
        spans.set(node, { start, end: length });
        return;
      }

      const element = node.nodeType === ELEMENT_NODE ? (node as Element) : null;
      // フェンスの中に包みは無い（位置を持たない text ノードは包まれない。
      // `./source-span.ts`）ので、`pre` の中では包みを探さない
      const wrapper = element && !insideFence ? readWrapperRange(element, source) : null;
      const fence = element !== null && !insideFence && element.tagName === FENCE_TAG;

      // コメント（`<!--v-if-->` など）は文字を持たないので、幅0の範囲になる
      for (const child of Array.from(node.childNodes)) visit(child, insideFence || fence);
      spans.set(node, { start, end: length });

      if (fence) {
        entries.push({
          kind: 'fence',
          start,
          end: length,
          position: element ? readWrapperRange(element, source) : null,
        });
        return;
      }

      if (wrapper) {
        const shown = sliceOfTexts(texts, start, length);
        const lead = alignWrapper(source.slice(wrapper.start, wrapper.end), shown);
        if (lead !== null) {
          entries.push({ kind: 'mapped', start, piece: wrapperPiece(start, length, wrapper.start + lead) });
        }
      }
    };

    visit(container, false);

    // 位置を落とすのは生テキストの先頭（offset 0）から始まるノードだけである（実測。
    // `test/app/components/workspace/markdown-fence-position.test.ts` の「生テキストの
    // 先頭から始まる要素は position を持たない」）。落ちた字は包まれずに面へ出るので、
    // **先頭に限って**照合で拾い直す。生テキストの頭と食い違ったところで止めるので、
    // 面にしか無い字（コードブロックの言語名の札）を巻き込まない
    const limit = entries[0]?.start ?? Number.POSITIVE_INFINITY;
    let head = '';
    for (const piece of texts) {
      if (piece.start >= limit) break;
      const grown = head + piece.node.data;
      if (!source.startsWith(grown)) break;
      head = grown;
    }
    if (head !== '') entries.unshift({ kind: 'mapped', start: 0, piece: wrapperPiece(0, head.length, 0) });

    // フェンスを解く。**前から順に。** 図（mermaid）は `pre` にならないので、生テキストの
    // 側の候補と `pre` の数は合わない。解けたフェンスの終わりから次を探すことで、
    // 図のフェンスを飛ばしながら前へ進む
    const mapped: Mapped[] = [];
    let after = 0;
    for (const entry of entries) {
      if (entry.kind === 'mapped') {
        mapped.push(entry.piece);
        after = Math.max(after, entry.piece.source.end);
        continue;
      }
      const map = resolveFence(entry, sliceOfTexts(texts, entry.start, entry.end), after);
      if (!map) continue;
      mapped.push(fencePiece(entry.start, entry.end, map));
      after = Math.max(after, map.sourceRange.end);
    }

    return { spans, texts, mapped };
  };

  /**
   * 解析側の座標で答える中身。外向きの2つがこれを包んで写像を通す。
   *
   * **ここから下は渡された文字列を知らない。** 知る必要が無いし、知ると基準が2つ
   * 混ざる場所が増える。
   */
  const inParsed: PositionPort = {
    toSourceRange(range: Range): SourceRange | null {
      const scanned = scan();

      const from = offsetOfBoundary(scanned, range.startContainer, range.startOffset);
      const to = offsetOfBoundary(scanned, range.endContainer, range.endOffset);
      if (from === null || to === null || from > to) return null;

      // 幅の無い選択（キャレット）は、その1点を含む一続きを1つ選んで潰した範囲を返す
      if (from === to) {
        for (const piece of scanned.mapped) {
          if (piece.start > from || from > piece.end) continue;
          const at = piece.toSource(from);
          if (at !== null) return { start: at, end: at };
        }
        return null;
      }

      // 重なった一続きだけを見る。**間に挟まった対応の無い領域（図・札）は跨いでよい。**
      // 生テキストの上では、拾えた最初の字から最後の字までが1つの連続した範囲になる
      let start: number | null = null;
      let end: number | null = null;

      for (const piece of scanned.mapped) {
        const low = Math.max(from, piece.start);
        const high = Math.min(to, piece.end);
        if (low >= high) continue;

        const head = piece.toSource(low);
        const tail = piece.toSource(high);
        if (head === null || tail === null) continue;

        start = start === null ? Math.min(head, tail) : Math.min(start, head, tail);
        end = end === null ? Math.max(head, tail) : Math.max(end, head, tail);
      }

      if (start === null || end === null) return null;
      return { start, end };
    },

    toDomRange({ start, end }: SourceRange): Range | null {
      if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
      if (start < 0 || end > source.length || start > end) return null;

      const scanned = scan();
      const from = offsetOfSource(scanned, start, 'start');
      const to = offsetOfSource(scanned, end, 'end');
      if (from === null || to === null || from > to) return null;

      const document = container.ownerDocument;
      if (!document) return null;

      const head = boundaryOfOffset(scanned, container, from, 'start');
      const tail = boundaryOfOffset(scanned, container, to, 'end');
      if (!head || !tail) return null;

      const range = document.createRange();
      range.setStart(head.node, head.offset);
      range.setEnd(tail.node, tail.offset);
      return range;
    },
  };

  return {
    toSourceRange(range: Range): SourceRange | null {
      if (!mapping) return null;
      const parsedRange = inParsed.toSourceRange(range);
      if (!parsedRange) return null;
      return mapping.toGiven(parsedRange);
    },

    toDomRange(range: SourceRange): Range | null {
      if (!mapping) return null;
      const parsedRange = mapping.toParsed(range);
      if (!parsedRange) return null;
      return inParsed.toDomRange(parsedRange);
    },
  };
}

/** 面の軸の上の範囲に当たる字。走査の途中でも呼べるように、集めた text ノードから組む */
function sliceOfTexts(texts: TextPiece[], from: number, to: number): string {
  let value = '';
  for (const piece of texts) {
    if (piece.end <= from) continue;
    if (piece.start >= to) break;
    value += piece.node.data.slice(Math.max(from - piece.start, 0), Math.min(to - piece.start, piece.node.data.length));
  }
  return value;
}

/** `Range` の端（ノードとオフセット）を、面の先頭からの文字数へ。器の外や範囲外は `null` */
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
 * 面の先頭からの文字数を、`Range` に渡せる端へ。
 *
 * text ノードの継ぎ目に当たる位置は、前のノードの末尾とも次のノードの先頭とも書ける。
 * 範囲の始まりは後ろ寄り（次のノードの先頭）、終わりは前寄り（前のノードの末尾）に採る。
 * こうすると範囲の中に空の端が挟まらず、選択の見え方が実際の字と揃う（`./plain.ts` と同じ）。
 */
function boundaryOfOffset(
  scanned: Scan,
  container: Node,
  offset: number,
  side: 'start' | 'end',
): { node: Node; offset: number } | null {
  // text ノードが1つも無い（中身が空の面）。器の頭を指すほかない
  if (scanned.texts.length === 0) return offset === 0 ? { node: container, offset: 0 } : null;

  for (const piece of scanned.texts) {
    const inside = side === 'start' ? offset < piece.end : offset <= piece.end;
    if (inside) return offset < piece.start ? null : { node: piece.node, offset: offset - piece.start };
  }

  // 末尾。始まり側はどの text ノードの内側にも入らないので、最後のノードの末尾へ
  const last = scanned.texts[scanned.texts.length - 1];
  if (!last || offset !== last.end) return null;
  return { node: last.node, offset: last.end - last.start };
}

/**
 * 生テキストの位置を、面の先頭からの文字数へ。
 *
 * **生テキストには面に出ていない字がある**（markdown の記号・箇条書きの印・フェンスの
 * 開き行と閉じ行）。そこを指されたときは、始まりなら次に出てくる字の頭へ、終わりなら
 * 前に出ていた字の末尾へ寄せる。**寄せた結果 `start` が `end` を追い越したら、その範囲に
 * 当たる字は面に1つも無い**ということなので、呼ぶ側は `null` を受け取る。
 */
function offsetOfSource(scanned: Scan, at: number, side: 'start' | 'end'): number | null {
  for (const piece of scanned.mapped) {
    // 範囲は `start` を含み `end` を含まない。継ぎ目は始まりなら後ろの、
    // 終わりなら前の一続きに属する
    const inside =
      side === 'start' ? at >= piece.source.start && at < piece.source.end : at > piece.source.start && at <= piece.source.end;
    if (!inside) continue;

    const offset = piece.toOffset(at);
    if (offset !== null) return offset;
  }

  if (side === 'start') {
    for (const piece of scanned.mapped) {
      if (piece.source.start >= at) return piece.start;
    }
    return null;
  }

  let last: number | null = null;
  for (const piece of scanned.mapped) {
    if (piece.source.end <= at) last = piece.end;
  }
  return last;
}
