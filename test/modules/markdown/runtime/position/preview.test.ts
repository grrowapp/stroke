// @vitest-environment happy-dom
/**
 * 整形された本文の面の位置の口（`#markdown/position/preview`）を、**実物の解析結果**で固定する。
 *
 * 入力は手で組まない。`parseMarkdown` → `markSourcePosition` を通した AST から DOM を組む。
 * 包みが付くかどうか・包みの範囲が中の字と揃うかどうかは解析の実測に依るので、手で組んだ
 * DOM で通しても意味がないからである（フェンスの食い違いそのものは
 * `test/app/components/workspace/markdown-fence-position.test.ts`、その埋め方は
 * `./fence.test.ts` が固定している。こちらは面の上の選択を生テキストへ落とす側の検査）。
 *
 * **DOM は `MDCRenderer` ではなく AST から直に組む。** `MDCRenderer` を通すには Nuxt の
 * 実行環境（`#components`・global 登録された `MarkdownFence`・図が使う `useColorMode`）が
 * 要り、単体テストに Nuxt のビルドと shiki を引き込むことになる。ここで確かめたいのは
 * 「包みの属性とフェンスの `pre` から位置が引けるか」だけなので、その2つを実物と同じ形で
 * 組み立てられれば足りる。`pre` の組み方は `../render/MarkdownFence.vue`（`ProsePre`）と
 * `../render/MarkdownDiagram.vue` の写しで、どちらかが変われば下の `renderFence` も
 * 直すこと。
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPreviewPositionPort } from '../../../../../modules/markdown/runtime/position/preview';
import { markSourcePosition } from '../../../../../modules/markdown/runtime/position/source-span';
import type { PositionPort, SourceRange } from '../../../../../modules/markdown/runtime/position/types';

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

/**
 * フェンスの範囲を `pre` の属性として置くか。
 *
 * 既定は置かない（今の `MDCRenderer` は `node.position` を捨てるので DOM に出ない）。
 * 図に添えた生テキスト（`../render/MarkdownDiagram.vue`）のように置く面があるので、
 * 置いた場合の振る舞いも固定する
 */
let markFencePosition: 'no' | 'real' | 'wrong' = 'no';

/** `../render/MarkdownFence.vue` の `LANGUAGE_NAME` のうち、ここで使うぶん */
const LANGUAGE_NAME: Record<string, string> = { ts: 'TypeScript', text: 'Plain Text' };

/**
 * フェンスを描く。`../render/MarkdownFence.vue` の振り分けと、その先の写し。
 *
 * **`code` も `position` も DOM には出ない。** `ProsePre` は `code` を props で受けて
 * `pre` へ戻さず、`MDCRenderer` は `node.position` を捨てる。画面に出るのは `code` の
 * 末尾を落とした字だけで、口はそこから対応表を組み直す。
 */
function renderFence(node: AstNode, document: Document): Node {
  const language = String(node.props?.language ?? '');
  const code = String(node.props?.code ?? '');

  // 図（mermaid）。SSR 直後の枝。位置の材料を1つも持たない
  if (language === 'mermaid') {
    const box = document.createElement('div');
    box.setAttribute('data-testid', 'mermaid-loading');
    const label = document.createElement('span');
    label.append(document.createTextNode('Loading diagram...'));
    box.append(label);
    return box;
  }

  const box = document.createElement('div');
  box.setAttribute('class', 'sb-code');
  box.setAttribute('data-testid', 'code-block');

  const toolbar = document.createElement('div');
  toolbar.setAttribute('class', 'sb-code-toolbar');
  const name = document.createElement('span');
  name.setAttribute('class', 'sb-code-language');
  name.setAttribute('data-testid', 'code-block-language');
  name.append(document.createTextNode(LANGUAGE_NAME[language] ?? language));
  toolbar.append(name);

  // `ProsePre` の root と `pre`。`ProsePre` は `inheritAttrs: false` を持たないので、
  // 渡した属性は両方に付く（`@nuxt/ui` 4.10.0 で実測）
  const root = document.createElement('div');
  const pre = document.createElement('pre');
  for (const element of [root, pre]) {
    element.setAttribute('data-language', language);
    element.setAttribute('data-testid', 'code-block-body');

    if (markFencePosition !== 'no' && node.position) {
      const shift = markFencePosition === 'wrong' ? 1 : 0;
      element.setAttribute('data-src-start', String(node.position.start + shift));
      element.setAttribute('data-src-end', String(node.position.end + shift));
    }
  }

  // shiki を通らない場合の枝。`code` を行に割って `span.line` を並べる（末尾は落とす）
  const body = document.createElement('code');
  const lines = code.trimEnd().split('\n');
  lines.forEach((text, index) => {
    const line = document.createElement('span');
    line.setAttribute('class', 'line');
    line.append(document.createTextNode(index === lines.length - 1 ? text : `${text}\n`));
    body.append(line);
  });
  pre.append(body);
  root.append(pre);

  box.append(toolbar, root);
  return box;
}

/** AST の1ノードを DOM へ。`MDCRenderer` が要素と text ノードに対してすることの写し */
function render(node: AstNode, document: Document): Node | null {
  if (node.type === 'text') return document.createTextNode(node.value ?? '');
  if (node.type !== 'element' || !node.tag) return null;
  if (node.tag === 'pre') return renderFence(node, document);

  const element = document.createElement(node.tag);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    // 位置の口が見るのは包みの属性だけ。他は見た目の指定なので数と種類を絞る
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    element.setAttribute(key, String(value));
  }
  for (const child of node.children ?? []) {
    const rendered = render(child, document);
    if (rendered) element.append(rendered);
  }
  return element;
}

/** 面ひとつ。生テキストを解析し、包みを付けてから DOM を組む */
interface Surface {
  container: HTMLElement;
  port: PositionPort;
  /** 面に出ている字を前から繋いだもの。選択の位置はこれの中で数える */
  text: string;
}

async function surface(source: string): Promise<Surface> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  const marked = markSourcePosition(body) as unknown as AstNode;

  const container = document.createElement('div');
  for (const child of marked.children ?? []) {
    const rendered = render(child, document);
    if (rendered) container.append(rendered);
  }
  document.body.append(container);

  return { container, port: createPreviewPositionPort({ container, source }), text: container.textContent ?? '' };
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

/** 面に出ている字のうち `needle` の箇所を選ぶ */
function selectText(surfaced: Surface, needle: string): Range {
  const at = surfaced.text.indexOf(needle);
  expect(at, `面に ${JSON.stringify(needle)} が無い`).toBeGreaterThanOrEqual(0);
  return select(surfaced.container, at, at + needle.length);
}

/** 生テキストの `needle` の箇所 */
function sourceRangeOf(source: string, needle: string): SourceRange {
  const at = source.indexOf(needle);
  expect(at, `生テキストに ${JSON.stringify(needle)} が無い`).toBeGreaterThanOrEqual(0);
  return { start: at, end: at + needle.length };
}

beforeEach(() => {
  document.body.innerHTML = '';
  markFencePosition = 'no';
});

describe('包みの中を選ぶ', () => {
  it('素の段落の一部', async () => {
    const source = 'まえ\n\nいろはにほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectText(surfaced, 'ろはに'));
    expect(range).toEqual(sourceRangeOf(source, 'ろはに'));
  });

  it('`**強調**` の内側。記号は範囲に入らない', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectText(surfaced, '強調'));
    expect(range).toEqual(sourceRangeOf(source, '強調'));
    expect(source.slice(range!.start, range!.end)).toBe('強調');
  });

  it('`` `インラインコード` `` の内側。**按分すればここでずれる**', async () => {
    // 包みの中は8文字だが、包みの指す範囲はバッククォートを含む10文字である（実測）。
    // 長さが一致する前提で按分すると、中を選んだ位置が1〜2文字ずれる
    const source = 'まえ\n\nいろは`インラインコード`にほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectText(surfaced, 'ンライ'));
    expect(range).toEqual(sourceRangeOf(source, 'ンライ'));
    expect(source.slice(range!.start, range!.end)).toBe('ンライ');
  });

  it('インラインコードの中身を丸ごと選んでも、バッククォートは入らない', async () => {
    const source = 'まえ\n\nいろは`コード`にほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectText(surfaced, 'コード'));
    expect(range).toEqual(sourceRangeOf(source, 'コード'));
  });

  it('バッククォート2つのインラインコードでも同じ', async () => {
    const source = 'まえ\n\nいろは`` a`b ``にほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toSourceRange(selectText(surfaced, 'a`b'));
    expect(range).toEqual(sourceRangeOf(source, 'a`b'));
  });
});

describe('要素をまたいで選ぶ', () => {
  it('強調をまたいで段落の途中まで', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n';
    const surfaced = await surface(source);

    const from = surfaced.text.indexOf('ろは');
    const to = surfaced.text.indexOf('にほ') + 2;
    const range = surfaced.port.toSourceRange(select(surfaced.container, from, to));

    // 生テキストの上では、記号を含んだ1つの連続した範囲になる
    expect(range).toEqual({ start: source.indexOf('ろは'), end: source.indexOf('にほ') + 2 });
    expect(source.slice(range!.start, range!.end)).toBe('ろは**強調**にほ');
  });

  it('見出しをまたぐ', async () => {
    const source = 'まえ\n\n# 見出し\n\n本文がある\n';
    const surfaced = await surface(source);

    const from = surfaced.text.indexOf('出し');
    const to = surfaced.text.indexOf('本文') + 2;
    const range = surfaced.port.toSourceRange(select(surfaced.container, from, to));

    expect(range).toEqual({ start: source.indexOf('出し'), end: source.indexOf('本文') + 2 });
  });

  it('リストの項目をまたぐ', async () => {
    const source = 'まえ\n\n- 項目1\n- 項目2\n';
    const surfaced = await surface(source);

    const from = surfaced.text.indexOf('目1');
    const to = surfaced.text.indexOf('項目2') + 3;
    const range = surfaced.port.toSourceRange(select(surfaced.container, from, to));

    // 箇条書きの印（`- `）は面に出ていないが、生テキストの上では範囲の中に入る
    expect(range).toEqual({ start: source.indexOf('目1'), end: source.indexOf('項目2') + 3 });
    expect(source.slice(range!.start, range!.end)).toBe('目1\n- 項目2');
  });
});

describe('文書のいちばん先頭から選ぶ', () => {
  it('位置を落とした先頭の字も拾う', async () => {
    // 生テキストの先頭（offset 0）から始まるノードは position を落とすので、
    // 先頭の段落の字は包まれずに面へ出る（実測）。照合で拾い直せなければ、
    // 先頭から選んでも始まりが後ろへずれる
    const source = 'まえ\n\nいろは\n';
    const surfaced = await surface(source);

    expect(surfaced.text.startsWith('まえ')).toBe(true);
    expect(surfaced.port.toSourceRange(select(surfaced.container, 0, 2))).toEqual({ start: 0, end: 2 });
    // 先頭から次の段落の途中まで
    expect(surfaced.port.toSourceRange(select(surfaced.container, 0, 4))).toEqual({ start: 0, end: 6 });
  });

  it('先頭が見出しなら、その字は包まれているので拾い直しは要らない', async () => {
    // position を落とすのは offset 0 から始まるノードだけ。`# 見出し` の text は
    // 2文字目から始まるので位置を持つ（実測）
    const source = '# 見出し\n\n本文\n';
    const surfaced = await surface(source);

    expect(surfaced.port.toSourceRange(selectText(surfaced, '見出し'))).toEqual(sourceRangeOf(source, '見出し'));
  });
});

describe('空の属性を「offset 0」と読まない', () => {
  /**
   * **`Number('') === 0` である。** 数だけを見るガード
   * （`Number.isInteger(parsed) && parsed >= 0`）はこれを素通しするので、`data-src-start=""`
   * が有効なオフセット 0 として読まれ、その包みが黙って文書の冒頭を指す。
   *
   * 「位置が無い」と「offset 0」の取り違えには経路が3つある。AST の側（包みを作らない）は
   * `./silent-failure.test.ts` の件2、`pre` の側（印を打たない）は `./pre-mark.test.ts`、
   * **属性を読む側がここ**である。
   */
  /**
   * 同じ字を持つ段落を2つ置く。
   *
   * **これで「黙って冒頭を指す」が見える形になる。** 空の属性が 0 として読まれると、
   * 包みの範囲が文書の頭まで広がり、`alignWrapper` の照合は**前の段落のほうの字**に
   * 当たってしまう（字が同じなので照合は通る）。返るのは `null` でも例外でもなく、
   * **もっともらしい別の場所**である。
   *
   * 前の段落が包まれないのは、生テキストの先頭（offset 0）から始まるノードが position を
   * 落とすためである（`./silent-failure.test.ts` の件2）。
   */
  const SOURCE = 'いろはにほへと\n\nいろはにほへと\n';

  /** 後ろの段落の `いろは`。面では7文字目から */
  const BEHIND = { from: 7, to: 10 };

  async function blanked(value: string): Promise<Surface> {
    const surfaced = await surface(SOURCE);
    const found = surfaced.container.querySelectorAll('span[data-src-start]');
    expect(found, '包みは後ろの段落のぶん1つだけのはず').toHaveLength(1);

    // 前提。属性が入っているうちは**後ろの段落**を指す（＝下の `null` は属性を潰した結果）
    expect(surfaced.port.toSourceRange(select(surfaced.container, BEHIND.from, BEHIND.to))).toEqual({
      start: SOURCE.lastIndexOf('いろは'),
      end: SOURCE.lastIndexOf('いろは') + 3,
    });

    found[0]!.setAttribute('data-src-start', value);
    return surfaced;
  }

  it('空の属性を持つ包みは、対応の取れない領域になる', async () => {
    // ガードを外すと `{ start: 0, end: 3 }`——**前の段落の `いろは`**——が返る
    const surfaced = await blanked('');

    expect(surfaced.port.toSourceRange(select(surfaced.container, BEHIND.from, BEHIND.to))).toBeNull();
  });

  it('空白だけの属性も同じ（`Number(" ") === 0`）', async () => {
    const surfaced = await blanked(' ');

    expect(surfaced.port.toSourceRange(select(surfaced.container, BEHIND.from, BEHIND.to))).toBeNull();
  });
});

describe('フェンス（コードブロック）', () => {
  const source = 'まえ\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\nあと\n';

  it('中の一部を選ぶ', async () => {
    const surfaced = await surface(source);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const b'))).toEqual(sourceRangeOf(source, 'const b'));
  });

  it('手前の段落からフェンスの中まで選ぶ', async () => {
    const surfaced = await surface(source);

    const from = surfaced.text.indexOf('まえ');
    const to = surfaced.text.indexOf('const a') + 7;
    const range = surfaced.port.toSourceRange(select(surfaced.container, from, to));

    // 開き行（```ts）は面に出ていないが、生テキストの上では範囲の中に入る
    expect(range).toEqual({ start: 0, end: source.indexOf('const a') + 7 });
    expect(source.slice(range!.start, range!.end)).toBe('まえ\n\n```ts\nconst a');
  });

  it('言語名の札は本文ではない。そこだけを選ぶと `null`', async () => {
    const surfaced = await surface(source);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'TypeScript'))).toBeNull();
  });

  it('タブは開いた空白のどこを指しても、もとのタブ1文字を指す', async () => {
    const tabbed = 'まえ\n\n```ts\n\tconst a = 1;\n```\n';
    const surfaced = await surface(tabbed);
    const tab = tabbed.indexOf('\t');

    // 画面では空白4つ。その2つめから `const` の手前までを選ぶ
    const from = surfaced.text.indexOf('    const') + 1;
    const range = surfaced.port.toSourceRange(select(surfaced.container, from, from + 3));
    expect(range).toEqual({ start: tab, end: tab + 1 });
  });

  it('図（mermaid）を挟んでも、後ろのフェンスの位置を取り違えない', async () => {
    // 図は `pre` にならないので、生テキストの側のフェンスの数と `pre` の数が合わない
    const mixed = 'まえ\n\n```mermaid\ngraph TD\nA-->B\n```\n\n```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(mixed);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const a'))).toEqual(sourceRangeOf(mixed, 'const a'));
  });

  it('リストの中のフェンス（器の印が剥がされる）でも取れる', async () => {
    const nested = 'まえ\n\n- 項目\n\n  ```ts\n  const a = 1;\n  ```\n';
    const surfaced = await surface(nested);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const'))).toEqual(sourceRangeOf(nested, 'const'));
  });

  it('範囲が属性で届いていればそれを使う', async () => {
    // `pre` が `data-src-start` / `data-src-end` を持つ面がある（図に添えた生テキスト。
    // `../render/source-shown.ts` の `readFenceRange`）。届いていれば探さない
    markFencePosition = 'real';
    const surfaced = await surface(source);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const b'))).toEqual(sourceRangeOf(source, 'const b'));
  });

  it('属性の範囲が中の字と合わなければ `null`。生テキストの側を探し直さない', async () => {
    // 面が「ここだ」と言っているのだから、合わないのは前提が崩れている証拠である。
    // 別の場所を探して当てにいくと、面の言い分を黙って上書きすることになる
    markFencePosition = 'wrong';
    const surfaced = await surface(source);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const b'))).toBeNull();
  });

  it('先頭から始まるフェンス（position が落ちる）でも取れる', async () => {
    // `pre` の position は落ちているうえ DOM にも出ないので、生テキストの側から探す
    const head = '```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(head);

    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const'))).toEqual(sourceRangeOf(head, 'const'));
  });
});

describe('対応が取れないときは null を返す', () => {
  it('図（mermaid）の中を指した', async () => {
    const source = 'まえ\n\n```mermaid\ngraph TD\nA-->B\n```\n';
    const surfaced = await surface(source);

    expect(surfaced.text).toContain('Loading diagram...');
    expect(surfaced.port.toSourceRange(selectText(surfaced, 'diagram'))).toBeNull();
  });

  it('4スペースのインデントコードブロック（対応表が作れない）', async () => {
    // フェンスの行が無いので `buildFenceMap` が `null` を返す（`./fence.test.ts`）。
    // 面には出ているが、位置は答えられない
    const source = 'まえ\n\n    const a = 1;\n    const b = 2;\n';
    const surfaced = await surface(source);

    expect(surfaced.text).toContain('const a = 1;');
    expect(surfaced.port.toSourceRange(selectText(surfaced, 'const a'))).toBeNull();
  });

  it('器の外を指した `Range`', async () => {
    const surfaced = await surface('まえ\n\nいろは\n');
    const outside = document.createElement('p');
    outside.append(document.createTextNode('外'));
    document.body.append(outside);

    const range = document.createRange();
    range.setStart(outside.firstChild!, 0);
    range.setEnd(outside.firstChild!, 1);
    expect(surfaced.port.toSourceRange(range)).toBeNull();
  });

  it('生テキストの範囲が整数でない・範囲の外', async () => {
    const source = 'まえ\n\nいろは\n';
    const surfaced = await surface(source);

    expect(surfaced.port.toDomRange({ start: 1.5, end: 2 })).toBeNull();
    expect(surfaced.port.toDomRange({ start: -1, end: 2 })).toBeNull();
    expect(surfaced.port.toDomRange({ start: 0, end: source.length + 1 })).toBeNull();
    expect(surfaced.port.toDomRange({ start: 3, end: 1 })).toBeNull();
  });

  it('図の中だけを指す生テキストの範囲（面に当たる字が無い）', async () => {
    const source = 'まえ\n\n```mermaid\ngraph TD\nA-->B\n```\n';
    const surfaced = await surface(source);

    expect(surfaced.port.toDomRange(sourceRangeOf(source, 'graph TD'))).toBeNull();
  });
});

describe('生テキストの位置から DOM の範囲へ', () => {
  it('段落の一部', async () => {
    const source = 'まえ\n\nいろはにほへと\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toDomRange(sourceRangeOf(source, 'ろはに'));
    expect(range?.toString()).toBe('ろはに');
  });

  it('フェンスの中', async () => {
    const source = 'まえ\n\n```ts\nconst a = 1;\n```\n';
    const surfaced = await surface(source);

    const range = surfaced.port.toDomRange(sourceRangeOf(source, 'const a'));
    expect(range?.toString()).toBe('const a');
  });

  it('面に出ていない字（markdown の記号）を指すと、出ている字の側へ寄る', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n';
    const surfaced = await surface(source);

    // `**強調**` を記号ごと指す
    const range = surfaced.port.toDomRange(sourceRangeOf(source, '**強調**'));
    expect(range?.toString()).toBe('強調');
  });
});

describe('往復して元に戻る', () => {
  const cases: { name: string; source: string; needle: string }[] = [
    { name: '素の段落', source: 'まえ\n\nいろはにほへと\n', needle: 'ろはに' },
    { name: '強調の中', source: 'まえ\n\nいろは**強調**にほへと\n', needle: '強調' },
    { name: 'インラインコードの中', source: 'まえ\n\nいろは`コード`にほへと\n', needle: 'ード' },
    { name: '見出し', source: 'まえ\n\n# 見出し\n\n本文\n', needle: '出し' },
    { name: 'リストの項目', source: 'まえ\n\n- 項目1\n- 項目2\n', needle: '項目2' },
    { name: 'フェンスの中', source: 'まえ\n\n```ts\nconst a = 1;\n```\n', needle: 'const a' },
    { name: '先頭の字', source: 'まえがき\n\nいろは\n', needle: 'まえ' },
  ];

  for (const { name, source, needle } of cases) {
    it(`DOM → 生 → DOM: ${name}`, async () => {
      const surfaced = await surface(source);
      const first = selectText(surfaced, needle);

      const position = surfaced.port.toSourceRange(first);
      expect(position, name).not.toBeNull();

      const second = surfaced.port.toDomRange(position!);
      expect(second, name).not.toBeNull();
      // 端の書き方（どの text ノードの中の何文字目か）は一意でないので、
      // 選ばれた字と、そこから引き直した位置が同じであることで見る
      expect(second!.toString(), name).toBe(first.toString());
      expect(surfaced.port.toSourceRange(second!), name).toEqual(position);
    });
  }

  it('要素をまたいだ範囲でも戻る', async () => {
    const source = 'まえ\n\nいろは**強調**にほへと\n';
    const surfaced = await surface(source);
    const first = select(surfaced.container, surfaced.text.indexOf('ろは'), surfaced.text.indexOf('にほ') + 2);

    const position = surfaced.port.toSourceRange(first);
    const second = surfaced.port.toDomRange(position!);

    expect(second!.toString()).toBe(first.toString());
    expect(surfaced.port.toSourceRange(second!)).toEqual(position);
  });
});
