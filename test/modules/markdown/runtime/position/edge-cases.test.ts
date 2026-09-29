// @vitest-environment happy-dom
/**
 * 位置の対応のうち、**まだ実測で決まっていなかった端**を固定する。
 *
 * `./preview.test.ts` は口の筋道（包み・フェンス・またぎ・往復）を固定している。こちらは
 * その筋道が「どこまで効くか」の境目だけを扱う。扱うのは3つ。
 *
 * 1. **記法ごとに `position` が記号を含むか。** `**強調**` は含まず `` `コード` `` は含む、
 *    というところまでは分かっていた。残りの記法は調べられていなかったので、ここで洗って
 *    並べる。`./source-span.ts` の包みと `./preview.ts` の `alignWrapper` は、この差の
 *    上に立っている
 * 2. **CRLF と front matter。** `parseMarkdown` は解析の前に CRLF を LF へ潰し、
 *    front matter を落とす（`node_modules/@nuxtjs/mdc/dist/runtime/parser/index.js:101`
 *    の `md.replace(/\r\n/g, "\n")` と `:70` の `parseFrontMatter`）。だから `position` は
 *    その後の本文を基準にする。生ファイルをそのまま口へ渡すと基準がずれる
 * 3. **印の無い `pre` と、生テキストを走査する逃げ道。** `pre` に位置の印を打つように
 *    なった（`./pre-mark.test.ts`）が、印が付かない `pre` がまだ残る。そこで逃げ道が
 *    要るかどうか
 *
 * **DOM は実物の経路に合わせて組む。** `./preview.test.ts` の `renderFence` は印が
 * DOM に出ない時代の写しで、既定では `pre` に印を置かない。こちらは印が出るようになった
 * 後（`MarkdownFence.vue` から `ProsePre` の `v-bind="$attrs"`）を写し、`markSourcePosition` が props へ
 * 載せた印をそのまま `pre` の属性にする。**どちらの経路を通ったかは、この印の有無だけで
 * 決まる。**
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPreviewPositionPort } from '../../../../../modules/markdown/runtime/position/preview';
import {
  SOURCE_END_ATTR,
  SOURCE_START_ATTR,
  markSourcePosition,
} from '../../../../../modules/markdown/runtime/position/source-span';
import type { PositionPort } from '../../../../../modules/markdown/runtime/position/types';

/** `modules/markdown/index.ts` の `installModule('@nuxtjs/mdc', …)` と同じ */
const PARSE_OPTIONS = {
  keepPosition: true,
  rehype: { plugins: { 'rehype-raw': false } },
} as const;

interface AstNode {
  type: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: AstNode[];
  value?: string;
  position?: { start: number; end: number };
}

function flatten(node: AstNode, out: AstNode[] = []): AstNode[] {
  out.push(node);
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

/** 解析しただけの AST。`position` はここに載る */
async function parseOnly(source: string): Promise<AstNode> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  return body as unknown as AstNode;
}

/**
 * 解析して包みを付けた AST。位置の印は `props` に載る。
 *
 * **包みの中の text ノードは `position` を持たない**（包みが持つので中には要らない。
 * `./source-span.ts`）。記法ごとの `position` を見るときは `parseOnly` のほうを使う。
 */
async function parse(source: string): Promise<AstNode> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  return markSourcePosition(body) as unknown as AstNode;
}

// ---------------------------------------------------------------------------
// 記法ごとの position
// ---------------------------------------------------------------------------

/**
 * 記法の中の字が、生テキストのどこを指していると言われているか。
 *
 * **包みが付くのは text ノードだけ**（`./source-span.ts`）なので、見るのも text ノードの
 * `position` である。要素（`strong` や `a`）の position は記号を含むが、包みにならない
 * ので位置の対応には効かない。
 *
 * @returns その字を持つ text ノードの position が指す生テキスト。position が無ければ `null`、
 *   そもそも text ノードが無ければ `undefined`
 */
async function pointedBy(source: string, value: string): Promise<string | null | undefined> {
  const found = flatten(await parseOnly(source)).find((node) => node.type === 'text' && node.value === value);
  if (!found) return undefined;
  if (!found.position) return null;
  return source.slice(found.position.start, found.position.end);
}

describe('記法ごとに、text ノードの position が記号を含むか', () => {
  /**
   * **記号を含まないほうが多数派である。** 強調も、リンクも、見出しの `#` も、リストの
   * 印も、引用の `>` も、表の `|` も、指すのは記号の内側だけになる。例外は
   * インラインコードひとつで、そこだけ範囲がバッククォートを含む。
   *
   * 前置きの段落を置くのは、生テキストの先頭（offset 0）から始まるノードが position を
   * 落とすためである（後述の「印の無い `pre`」を参照）。
   */
  const 記号を含まない: [string, string, string][] = [
    ['`**強調**`', 'まえ\n\nこれは **強調** です。\n', '強調'],
    ['`*斜体*`', 'まえ\n\nこれは *斜め* です。\n', '斜め'],
    ['`_斜体_`', 'まえ\n\nこれは _斜め_ です。\n', '斜め'],
    ['`***二重強調***`', 'まえ\n\nこれは ***両方*** です。\n', '両方'],
    ['`~~打ち消し~~`', 'まえ\n\nこれは ~~消し~~ です。\n', '消し'],
    ['`~打ち消し~`（チルダ1つ）', 'まえ\n\nこれは ~消し~ です。\n', '消し'],
    ['リンク `[a](b)` のラベル', 'まえ\n\nこれは [ラベル](https://example.com) です。\n', 'ラベル'],
    ['参照リンク `[a][r]` のラベル', 'まえ\n\n[ラベル][r] です。\n\n[r]: https://example.com\n', 'ラベル'],
    ['自動リンク `<url>`', 'まえ\n\nこれは <https://example.com> です。\n', 'https://example.com'],
    ['裸の URL（GFM）', 'まえ\n\nこれは https://example.com です。\n', 'https://example.com'],
    ['見出しの `#`', 'まえ\n\n## 見出しの字\n', '見出しの字'],
    ['見出しの `=====`（setext）', 'まえ\n\n見出しの字\n=====\n', '見出しの字'],
    ['箇条書きの `- `', 'まえ\n\n- 項目の字\n', '項目の字'],
    ['番号付きの `1. `', 'まえ\n\n1. 項目の字\n', '項目の字'],
    ['入れ子の箇条書き', 'まえ\n\n- 親の字\n  - 子の字\n', '子の字'],
    ['引用の `> `', 'まえ\n\n> 引用の字\n', '引用の字'],
    ['表のセルの `|`', 'まえ\n\n| 見出 | 列 |\n| --- | --- |\n| セル | 値 |\n', 'セル'],
    ['リンクの中の強調', 'まえ\n\n[**太字**リンク](https://example.com)\n', '太字'],
    ['MDC ブロック `::note`', 'まえ\n\n::note\n中の字\n::\n', '中の字'],
  ];

  it.each(記号を含まない)('%s は記号を含まない', async (_name, source, value) => {
    expect(await pointedBy(source, value)).toBe(value);
  });

  it('`` `インラインコード` `` だけは記号を含む', async () => {
    // **ここだけ包みの中身と範囲がずれる。** 中身は記号の内側、範囲は記号の外側。
    // `./preview.ts` の `alignWrapper` はこの差を按分せず、照合で頭を探す
    expect(await pointedBy('まえ\n\nこれは `コード` です。\n', 'コード')).toBe('`コード`');
  });

  it('バッククォート2つでも、前後に空白があっても、範囲は記号の外側', async () => {
    // 記号の数が変わっても、CommonMark が剥がす前後1つの空白が入っても、範囲は外側のまま。
    // `alignWrapper` が中央から試すのはこの形（前後に同じ数だけ付く）を当て込んでいる
    expect(await pointedBy('まえ\n\nこれは ``コ`ド`` です。\n', 'コ`ド')).toBe('``コ`ド``');
    expect(await pointedBy('まえ\n\nこれは ` コード ` です。\n', 'コード')).toBe('` コード `');
  });

  it('強調の中のインラインコードでも、含むのはコードのほうだけ', async () => {
    const source = 'まえ\n\n**強い `コード` だ**\n';

    expect(await pointedBy(source, '強い ')).toBe('強い ');
    expect(await pointedBy(source, 'コード')).toBe('`コード`');
  });

  /**
   * **text ノードが無い記法もある。** 画像の alt は props へ入るので、画面に字として
   * 出ない。包む相手が無いので、位置の対応も無い（`null` の材料になる）。
   */
  it('画像 `![a](b)` の alt は text ノードにならない', async () => {
    expect(await pointedBy('まえ\n\n![代替](https://example.com/a.png) です。\n', '代替')).toBeUndefined();
  });

  /**
   * **position を持たない text ノードもある。** 脚注の参照は解析が組み立てた番号なので、
   * 生テキストのどこから来たかを言えない。`./source-span.ts` は包まないので、口は
   * そこを対応の無い領域として扱う。
   */
  it('脚注の参照 `[^1]` が出す番号は position を持たない', async () => {
    expect(await pointedBy('まえ\n\n本文[^1]。\n\n[^1]: 註の字。\n', '1')).toBeNull();
  });

  it('タスクリストの印が足す空白も position を持たない', async () => {
    // `- [x] ` はチェックボックスの `input` と空白1つになる。空白は解析が足したものなので、
    // 生テキストのどこから来たかを言えない。項目の字のほうは記号を含まない
    const source = 'まえ\n\n- [x] やった\n- [ ] まだ\n';

    expect(await pointedBy(source, ' ')).toBeNull();
    expect(await pointedBy(source, 'やった')).toBe('やった');
  });

  it('強い改行は `br` になる。text ノードにならない', async () => {
    // 行末の空白2つも `\` も、`br` 要素の position に入って字にはならない
    expect(await pointedBy('まえ\n\nいち  \nに\n', 'いち')).toBe('いち');
    expect(await pointedBy('まえ\n\nいち  \nに\n', '  \n')).toBeUndefined();
  });

  /**
   * **範囲と中身の長さが食い違う向きは2つある。**
   *
   * - 範囲のほうが長い……インラインコード・エスケープ・実体参照。照合で頭を探せる
   *   ことも、探せないこともある
   * - **中身のほうが長い**……脚注の定義。戻りリンクのぶんの空白が値に足されるので、
   *   範囲より1文字長くなる。`alignWrapper` はこの向きを `null` にする
   */
  it('脚注の定義は、中身のほうが範囲より長い', async () => {
    const source = 'まえ\n\n本文[^1]。\n\n[^1]: 註の字。\n';

    // 値には戻りリンクのぶんの空白が足されている
    expect(await pointedBy(source, '註の字。 ')).toBe('註の字。');
  });

  it('エスケープと実体参照は、描かれた字が生テキストにその形で無い', async () => {
    // 範囲は記号を含んだままなので、中の字は範囲の中に見つからない。
    // `alignWrapper` の `indexOf` が外れて、その包みは対応の取れない領域になる
    expect(await pointedBy('まえ\n\n\\*星\\* の字。\n', '*星* の字。')).toBe('\\*星\\* の字。');
    expect(await pointedBy('まえ\n\nA &amp; B の字。\n', 'A & B の字。')).toBe('A &amp; B の字。');
  });
});

// ---------------------------------------------------------------------------
// 面を組む（実物の経路の写し）
// ---------------------------------------------------------------------------

/** `../render/MarkdownFence.vue` の `LANGUAGE_NAME` のうち、ここで使うぶん */
const LANGUAGE_NAME: Record<string, string> = { ts: 'TypeScript', text: 'Plain Text' };

/**
 * フェンスを描く。`../render/MarkdownFence.vue` の振り分けと、その先の写し。
 *
 * **位置の印は `props` から `pre` の属性へそのまま抜ける。** `MDCRenderer` は `node.props`
 * を受け側へ渡し、`ProsePre` は `language` と `code` を props で宣言しているので、
 * `data-src-start` / `data-src-end` は `$attrs` に残って `v-bind="$attrs"` で `pre` に付く。
 * 印が付かないのは、**`markSourcePosition` が印を打てなかった `pre` だけ**である。
 *
 * **同じ印が `pre` を包む入れ物の `div` にも付く。** `ProsePre` は `inheritAttrs: false` を
 * 持たないので、`$attrs` は root の `div` にも落ちる（`@nuxt/ui` 4.10.0 で実測）。
 * 位置の口がこの `div` の印を読まないことも、ここで一緒に固定される。
 */
function renderFence(node: AstNode, doc: Document): Node {
  const language = String(node.props?.language ?? '');
  const code = String(node.props?.code ?? '');

  // 図（mermaid）。SSR 直後の枝。位置の材料を1つも持たない
  if (language === 'mermaid') {
    const box = doc.createElement('div');
    box.setAttribute('data-testid', 'mermaid-loading');
    const label = doc.createElement('span');
    label.append(doc.createTextNode('Loading diagram...'));
    box.append(label);
    return box;
  }

  const box = doc.createElement('div');
  box.setAttribute('class', 'sb-code');

  const toolbar = doc.createElement('div');
  const name = doc.createElement('span');
  name.append(doc.createTextNode(LANGUAGE_NAME[language] ?? language));
  toolbar.append(name);

  // `ProsePre` の root。`$attrs` が `pre` と同じく落ちる
  const root = doc.createElement('div');
  const pre = doc.createElement('pre');
  for (const element of [root, pre]) {
    element.setAttribute('data-language', language);
    for (const key of [SOURCE_START_ATTR, SOURCE_END_ATTR]) {
      const value = node.props?.[key];
      if (value !== undefined) element.setAttribute(key, String(value));
    }
  }

  // shiki を通らない場合の枝。`code` を行に割って `span.line` を並べる（末尾は落とす）
  const body = doc.createElement('code');
  const lines = code.trimEnd().split('\n');
  lines.forEach((text, index) => {
    const line = doc.createElement('span');
    line.setAttribute('class', 'line');
    line.append(doc.createTextNode(index === lines.length - 1 ? text : `${text}\n`));
    body.append(line);
  });
  pre.append(body);
  root.append(pre);

  box.append(toolbar, root);
  return box;
}

/** AST の1ノードを DOM へ。`MDCRenderer` が要素と text ノードに対してすることの写し */
function render(node: AstNode, doc: Document): Node | null {
  if (node.type === 'text') return doc.createTextNode(node.value ?? '');
  if (node.type !== 'element' || !node.tag) return null;
  if (node.tag === 'pre') return renderFence(node, doc);

  const element = doc.createElement(node.tag);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    element.setAttribute(key, String(value));
  }
  for (const child of node.children ?? []) {
    const rendered = render(child, doc);
    if (rendered) element.append(rendered);
  }
  return element;
}

interface Surface {
  container: HTMLElement;
  port: PositionPort;
  /** 面に出ている字を前から繋いだもの。選択の位置はこれの中で数える */
  text: string;
  /** `pre` に付いた印。付いていなければ `null` */
  marks: (string | null)[];
}

/**
 * 面ひとつ。
 *
 * @param source 口へ渡す生テキスト
 * @param parsed 解析に渡す文字列。省略すれば `source` と同じ（＝基準が揃っている）
 */
async function surface(source: string, parsed: string = source): Promise<Surface> {
  const marked = await parse(parsed);

  const container = document.createElement('div');
  for (const child of marked.children ?? []) {
    const rendered = render(child, document);
    if (rendered) container.append(rendered);
  }
  document.body.append(container);

  const marks = Array.from(container.querySelectorAll('pre')).map((pre) => {
    const start = pre.getAttribute(SOURCE_START_ATTR);
    const end = pre.getAttribute(SOURCE_END_ATTR);
    return start === null || end === null ? null : `${start}..${end}`;
  });

  return { container, port: createPreviewPositionPort({ container, source }), text: container.textContent ?? '', marks };
}

/** 面の先頭からの文字数を `Range` の端へ。text ノードを前から辿るだけ */
function pointAt(container: Node, offset: number): { node: Node; offset: number } {
  let seen = 0;
  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === 3) {
      const value = (node as Text).data;
      if (offset <= seen + value.length) return { node, offset: offset - seen };
      seen += value.length;
      return null;
    }
    for (const child of Array.from(node.childNodes)) {
      const hit = visit(child);
      if (hit) return hit;
    }
    return null;
  };
  return visit(container) ?? { node: container, offset: 0 };
}

/** 面の先頭から数えた範囲を選ぶ */
function select(container: Node, from: number, to: number): Range {
  const head = pointAt(container, from);
  const tail = pointAt(container, to);
  const range = document.createRange();
  range.setStart(head.node, head.offset);
  range.setEnd(tail.node, tail.offset);
  return range;
}

/** 面に出ている字のうち `needle` の `nth` 番目（0 始まり）を選ぶ */
function selectNth(surfaced: Surface, needle: string, nth = 0): Range {
  let at = -1;
  for (let count = 0; count <= nth; count += 1) {
    at = surfaced.text.indexOf(needle, at + 1);
    expect(at, `面に ${JSON.stringify(needle)} の ${nth + 1} 個めが無い`).toBeGreaterThanOrEqual(0);
  }
  return select(surfaced.container, at, at + needle.length);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// CRLF と front matter
// ---------------------------------------------------------------------------

/**
 * **決めたこと: 口へ渡す生テキストは、`parseMarkdown` が実際に解析した文字列とする。**
 * つまり CRLF を LF へ潰し、front matter を落とした後の本文である。生ファイルを渡すのは
 * 呼ぶ側の誤りであって、口が受け付ける入力ではない。
 *
 * **「基準がずれていたら `null` に倒れる」は選べない。** 倒れないからである。下に置いた
 * 2つは、生ファイルをそのまま渡したときに口が**黙って別の場所を返す**実測で、どちらも
 * 返ってきた字は選んだ字と同じに見える。`null` を当てにする設計は、この2つを見逃す。
 *
 * だから固定するのは次の3つ。
 *
 * 1. 正規化して渡せば、CRLF の文書も front matter 付きの文書も正しく引ける（口は壊れていない）
 * 2. 生ファイルを渡すと、黙って誤った範囲が返る（**`null` に倒れない**）
 * 3. その誤りは、正規化して渡せば消える
 *
 * 本家（spec-workflow-mcp）の文書は `.spec-workflow` の下に置かれた平文の md で、本家も
 * stroke-board も改行を触らない（本家は `readFile(path, 'utf-8')` / `writeFile` の
 * 素通し、アプリ側も `server/utils/upstream/rest.ts` から画面まで文字列に手を入れない）。
 * 書くのは人間か別のエージェントなので、**CRLF も front matter も現実に来うる**。
 * 「扱わない」で済ませられる入力ではない。
 */
describe('CRLF と front matter は、面が自分で吸収する', () => {
  /**
   * CRLF の文書。
   *
   * 生ファイルでは3つめの段落の `x` は offset 15 に在る。位置の印は LF へ潰した後
   * （offset 10）を基準にしている。
   *
   * **かつてはここで別の場所が返っていた。** 生ファイルの offset 10 にも `x` が在り
   * （2つめの段落）、長さも字も揃うので `alignWrapper` の照合を素通りしていた。
   * 面が写像を持つようになって解消した（`../normalize.ts`）。
   */
  const CRLF = 'ab\r\ncd\r\n\r\nx\r\n\r\nx\r\n';

  /**
   * front matter 付きの文書。
   *
   * 本文の `**b**` の `b` は生ファイルの offset 19。位置の印は front matter を落とした後を
   * 基準にしていて offset 7 を指す。
   *
   * **かつてはここで別の場所が返っていた。** 生ファイルの offset 7 は front matter の
   * `a: b` の `b` で、**本文を選んだのに front matter の中を返していた。**
   */
  const FRONT_MATTER = '---\na: b\n---\nab\n\n**b**\n';

  it('CRLF: 揃えた文字列を渡せば、その文字列の基準で答える', async () => {
    // 面から見れば「渡された文字列」がこれなので、この文字列を基準に答える
    const normalized = CRLF.replace(/\r\n/g, '\n');
    const surfaced = await surface(normalized);

    // 3つめの段落の `x`（面では2つめの `x`）
    const range = surfaced.port.toSourceRange(selectNth(surfaced, 'x', 1));
    expect(range).toEqual({ start: 10, end: 11 });
    expect(normalized.slice(0, range!.start)).toBe('ab\ncd\n\nx\n\n');
  });

  it('CRLF: 生ファイルを渡しても、その生ファイルの基準で正しく答える', async () => {
    const surfaced = await surface(CRLF);

    const range = surfaced.port.toSourceRange(selectNth(surfaced, 'x', 1));

    expect(range).not.toBeNull();
    expect(CRLF.slice(range!.start, range!.end)).toBe('x');
    // **3つめの段落の `x`。** かつてはここが 10（2つめの段落）だった
    expect(range).toEqual({ start: 15, end: 16 });
    expect(CRLF.indexOf('x', 11)).toBe(15);
  });

  it('front matter: 正規化して渡せば正しく引ける', async () => {
    // `parseMarkdown` が解析するのは front matter を落とした後の本文
    // （`node_modules/remark-mdc/dist/index.mjs` の `parseFrontMatter`。区切りの
    // 行の改行が1つ残る）
    const body = '\nab\n\n**b**\n';
    const surfaced = await surface(body);

    const range = surfaced.port.toSourceRange(selectNth(surfaced, 'b', 1));
    expect(range).not.toBeNull();
    expect(body.slice(range!.start, range!.end)).toBe('b');
    expect(range).toEqual({ start: 7, end: 8 });
  });

  it('front matter: 生ファイルを渡しても、本文の側を指す', async () => {
    const surfaced = await surface(FRONT_MATTER);

    // 本文の `**b**` の `b`（面では2つめの `b`）
    const range = surfaced.port.toSourceRange(selectNth(surfaced, 'b', 1));

    expect(range).not.toBeNull();
    expect(FRONT_MATTER.slice(range!.start, range!.end)).toBe('b');
    // **本文の `b`。** かつてはここが 7（front matter の `a: b` の `b`）だった
    expect(range).toEqual({ start: 19, end: 20 });
    expect(FRONT_MATTER.indexOf('b', 16)).toBe(19);
  });

  it('CRLF の文書でも、記号を伴う記法の中を選べる', async () => {
    // **かつてはここが `null` だった。** 切り出しに `\r` が入り、描かれた字には `\r` が
    // 無いので照合が外れていた。当時は「ずれが小さければ `null` に倒れることも多い。
    // だが当てにはできない」という題で、`null` を偶然の副産物として記録していた。
    // 面が写像を持ついま、倒れる理由が無くなったので正しく引ける側へ移した
    const source = 'まえ\r\n\r\nいろは**強調**にほへと\r\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectNth(surfaced, '強調'));
    expect(range).not.toBeNull();
    expect(source.slice(range!.start, range!.end)).toBe('強調');
  });
});

// ---------------------------------------------------------------------------
// 印の無い pre と、生テキストを走査する逃げ道
// ---------------------------------------------------------------------------

/**
 * **走査の逃げ道は残す。** 印の付かない `pre` が実在し、そこは逃げ道でしか解けないため。
 *
 * 印が付かないのは1つだけ、**生テキストの先頭（offset 0）から始まるフェンス**である。
 * `@nuxtjs/mdc` は position を真偽で拾うので（`dist/runtime/parser/compiler.js:13` の
 * `node.position?.start?.offset && node.position?.end?.offset ? … : void 0`）、
 * `start.offset` が `0` だと落ちる。`markSourcePosition` は position の無いノードに印を
 * 打たない（打てば「対応が取れない」を言えなくなる）ので、この `pre` は印を持てない。
 *
 * front matter を落とした後の本文は区切りの改行が1つ残るため、front matter の直後の
 * フェンスは offset 0 にならない。つまり **`pre` の印が落ちるのは「文書がフェンスで
 * 始まる」場合だけ**である。
 *
 * **どちらの経路を通ったかは印の有無で決まる。** 印が有れば口はその範囲しか試さず、
 * 合わなければ `null` を返す（生テキストの側を探し直さない）。印が無いときだけ走査へ
 * 落ちる。下の束がその境目を固定する。
 *
 * **経路の見分けはテストの名前で示す。実行時に経路を返す仕組みは足さない**
 * （`openspec/changes/adr0017-sub-add-detection-assumptions/design.md` の決定3）。
 * 検査のために内部の形を外へ広げると、そこが新しい公開面になる。だから頭に
 * 「印の経路」「走査の経路」と書き、入力もそれぞれ別の it に分けてある。
 */
describe('印の無い pre だけが、生テキストの走査へ落ちる', () => {
  it('印の経路: 文書の途中のフェンスには印が付く（走査は要らない）', async () => {
    const source = 'まえ\n\n```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(source);

    expect(surfaced.marks).toEqual(['4..26']);
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toEqual({
      start: source.indexOf('const a'),
      end: source.indexOf('const a') + 7,
    });
  });

  it('走査の経路: 文書がフェンスで始まると印が落ちる（ここだけが走査へ落ちる）', async () => {
    const source = '```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(source);

    // 印が無い＝ここが走査へ落ちる唯一の入口
    expect(surfaced.marks).toEqual([null]);
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toEqual({
      start: source.indexOf('const a'),
      end: source.indexOf('const a') + 7,
    });
  });

  it('両方の経路: 印の落ちたフェンスと印の付いたフェンスが混ざっても取り違えない', async () => {
    // 先頭のフェンスだけ走査で、あとは印で解く
    const source = '```ts\nconst a = 1;\n```\n\nあと\n\n```ts\nconst b = 2;\n```\n';
    const surfaced = await surface(source);

    expect(surfaced.marks).toEqual([null, '28..50']);
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toEqual({
      start: source.indexOf('const a'),
      end: source.indexOf('const a') + 7,
    });
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const b'))).toEqual({
      start: source.indexOf('const b'),
      end: source.indexOf('const b') + 7,
    });
  });

  it('印の経路: 合わなくても `null`。走査は代わりを務めない', async () => {
    // 基準のずれた生テキストを渡すと、印の指す範囲は中の字と合わなくなる。
    // ここで生テキストの側を探し直すと、面の言い分を黙って上書きすることになる。
    // **合わなければ `null`。** 走査は代わりを務めない
    const parsed = 'まえ\n\n```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(`\n${parsed}`, parsed);

    expect(surfaced.marks).toEqual(['4..26']);
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toBeNull();
  });

  it('走査の経路: 生テキストの側に合う候補が無ければ `null`（推測で当てにいかない）', async () => {
    // 印の無いフェンス（＝走査へ落ちる唯一の入口）で、面に出ている字と生テキストが
    // 食い違う場合。走査は候補を前から試すが、**桁まで合わなければ採らない**
    // （`preview.ts` の `resolveFence` → `fence.ts` の `buildFenceMap`）。
    // ここで「近いから」と当てにいくと、コードブロックの中を黙って別の場所へ写す
    const parsed = '```ts\nconst a = 1;\n```\n';
    const surfaced = await surface('```ts\nconst b = 2;\n```\n', parsed);

    expect(surfaced.marks, '印が付いていたら、この it は走査の経路を見ていない').toEqual([null]);
    expect(surfaced.text).toContain('const a = 1;');
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toBeNull();
  });

  it('どちらの経路でも解けない: 4スペースのインデントは印が付いてもフェンスではない', async () => {
    // 印は `pre` に付くが、フェンスの行が無いので `buildFenceMap` が作れない
    // （`./fence.test.ts`）。走査もフェンスを見つけないので、どちらの経路でも解けない
    const source = 'まえ\n\n    const a = 1;\n    const b = 2;\n';
    const surfaced = await surface(source);

    expect(surfaced.marks).toEqual(['4..37']);
    expect(surfaced.text).toContain('const a = 1;');
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toBeNull();
  });

  it('印の経路: 図（mermaid）は `pre` にならないので、印も走査の相手も持たない', async () => {
    // 先頭が図でも、後ろのフェンスは印で解ける（走査の出す候補と `pre` の数は合わない）
    const source = '```mermaid\ngraph TD\nA-->B\n```\n\n```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(source);

    expect(surfaced.marks).toEqual(['31..53']);
    expect(surfaced.port.toSourceRange(selectNth(surfaced, 'const a'))).toEqual({
      start: source.indexOf('const a'),
      end: source.indexOf('const a') + 7,
    });
  });
});
