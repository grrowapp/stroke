// @vitest-environment happy-dom
/**
 * **黙って壊れる3件**に、踏んだら止まる検知を置く。
 *
 * 位置の対応を作る途中で崩れた推測のうち、次の3件は**症状が出ないまま誤った答えを返す**か、
 * **別の場所が壊れる**。資料に書くだけでは、読まなかった人が同じ穴に落ちるので、ここで
 * 落とす。他のテストが「正しく動くこと」を固定するのに対し、この束は「**間違った直し方を
 * したときに赤くなること**」だけを目的にしている。
 *
 * 1. **解析を自前で組み直すとハイドレーションが壊れる**（`../render/MarkdownView.vue`）。
 *    `<MDC>` のスロットだけを差し替えるという形から外れると、クライアントが再解析して
 *    shiki が SSR と違う色を出し、ずれが**アプリ全体のアイコンの消失**として出る。
 *    markdown の本文には何も起きないので、本文を見る検査では捕まらない。
 *    症状が本文の外に出るぶんは `e2e/markdown-hydration.spec.ts` が見る。
 * 2. **offset 0 から始まる要素は `position` が `undefined`**。`@nuxtjs/mdc` の
 *    `parser/compiler.js` が `node.position?.start?.offset && …` と真偽で判定するため、
 *    文書の冒頭の要素だけが位置を丸ごと落とす。ここに 0 を書くと、冒頭が黙って
 *    `[0,0)` を指す。
 * 3. **記法によって `position` が記号を含むか違う**。長さを按分すると1〜2文字ずれた位置を
 *    黙って返す。どの記法が記号を含むかは推測できないので、**実測して列挙する**。
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildFenceMap } from '../../../../../modules/markdown/runtime/position/fence';
import { createPlainPositionPort } from '../../../../../modules/markdown/runtime/position/plain';
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

// ---------------------------------------------------------------------------
// 件1: 解析の段を自前で組み直させない
// ---------------------------------------------------------------------------

// vitest は作業ツリーの根から走る（`import.meta.url` は file: にならないので使えない）
const MARKDOWN_VIEW = join(process.cwd(), 'modules/markdown/runtime/render/MarkdownView.vue');

/**
 * コメントを落とした本文。
 *
 * この検査は「書いてあるか」ではなく「**やっているか**」を見る。禁じた名前は説明のために
 * コメントへ書かれている（そう書いてあるからこそ踏むのだが）ので、コメントを落としてから
 * 見ないと、注意書きそのものを違反として拾ってしまう。
 */
function withoutComments(vue: string): string {
  return vue
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * 本文を描く口が「`<MDC>` のスロットだけを差し替える」形から外れていないか。
 *
 * **外れ方は1つではない。** `parseMarkdown` を直に呼ぶ、`useAsyncData` で payload を
 * 自前で持つ、`<MDC>` をやめて `MDCRenderer` だけを置く、`keepPosition` を落とす——
 * どれも「解析の段に手を入れた」ことになる。踏んだ形が分かるように、違反を名前で返す。
 *
 * @returns 違反の名前。空なら形を保っている
 */
function parseStageViolations(vue: string): string[] {
  const code = withoutComments(vue);
  const found: string[] = [];

  // 解析を自前で呼ぶと、client 側でもう一度走って SSR と食い違う
  if (/\bparseMarkdown\b/.test(code)) found.push('parseMarkdown を自分で呼んでいる');
  // payload の受け渡しを写すと、`<MDC>` が持っていた「待つ位置」まで移ってくる
  if (/\buseAsyncData\b/.test(code)) found.push('useAsyncData を自分で持っている');
  // 解析の段は `<MDC>` に残す
  if (!/<MDC[\s>]/.test(code)) found.push('<MDC> を通していない');
  // 位置の口はこれが無いと成り立たない（`../position/source-span.ts`）
  if (!/keepPosition/.test(code)) found.push('keepPosition を渡していない');
  // 手当てはスロットの中だけ。渡ってきた AST を包んで同じ `MDCRenderer` へ送る
  if (!/markSourcePosition\(\s*body\s*\)/.test(code)) found.push('スロットの中で markSourcePosition を通していない');

  return found;
}

/**
 * **ここは従である。**
 *
 * 主は `../render/markdown-view-position.test.ts` の「解析の段は `<MDC>` に残っている」で、
 * あちらは `<MDC>` のスタブが**実際に描かれたか**で見る（`openspec/changes/
 * adr0017-sub-add-detection-assumptions/design.md` の決定2）。文字列の検査は書き方に依存し、
 * `import()` の動的形や再輸出で抜けるので、こちらは安い補助として置く。
 *
 * **偽陽性が続くようならこの束だけを落とす**（同 design.md の R6）。主が生きていれば
 * 検知は成り立つ。
 */
describe('件1: 解析の段を自前で組み直させない', () => {
  const vue = readFileSync(MARKDOWN_VIEW, 'utf-8');

  it('`<MDC>` のスロットだけを差し替える形を保っている', () => {
    // 落ちたら、まず `../render/MarkdownView.vue` の注意書きを読むこと。
    // 「アイコンが消える」という**本文の外の症状**として出る崩れ方がある
    expect(parseStageViolations(vue)).toEqual([]);
  });

  /*
   * 毒見。**この検査が本当に落とせるか**を、崩した中身を通して確かめる。
   *
   * 実ファイルを一時的に書き換えて確かめる手もあるが、この面は同時に触られることがあり、
   * 書き換えの取り違えが他人の作業を巻き込む。中身は読むだけにして、崩したのは
   * 手元の写しにする。
   */
  const poisons: [string, (source: string) => string, string][] = [
    [
      '解析を写して置き換えた',
      (source) =>
        source.replace(
          'markSourcePosition(body)',
          'markSourcePosition((await useAsyncData(() => parseMarkdown(props.value))).data.value.body)',
        ),
      'parseMarkdown を自分で呼んでいる',
    ],
    [
      '`<MDC>` をやめて `MDCRenderer` だけを置いた',
      // 注意書きの中にも `<MDC>` と書いてあるので、**全部**を潰さないと検査が空振りする
      (source) => source.replace(/<MDC([\s>])/g, '<div$1'),
      '<MDC> を通していない',
    ],
    [
      '`keepPosition` を落とした',
      (source) => source.replace(/keepPosition/g, 'keepPositionX').replace(/keepPositionX/g, 'noop'),
      'keepPosition を渡していない',
    ],
    [
      '包みを通さず素の AST を渡した',
      (source) => source.replace('markSourcePosition(body)', 'body'),
      'スロットの中で markSourcePosition を通していない',
    ],
  ];

  for (const [name, poison, expected] of poisons) {
    it(`崩したら気づく: ${name}`, () => {
      const broken = poison(vue);
      expect(broken, '毒見が中身を変えていない。実ファイルの形が変わった可能性がある').not.toBe(vue);
      expect(parseStageViolations(broken)).toContain(expected);
    });
  }

  it('注意書きに書いてある名前を違反と読み違えない', () => {
    // `MarkdownView.vue` のコメントは `parseMarkdown` も `useAsyncData` も名指しで
    // 禁じている。コメントを落とさずに見ると、注意書きが在るほど落ちる検査になる
    expect(vue).toContain('parseMarkdown');
    expect(withoutComments(vue)).not.toContain('parseMarkdown');
  });
});

// ---------------------------------------------------------------------------
// 件2: offset 0 と「位置が無い」を取り違えない
// ---------------------------------------------------------------------------

/** 包み（`span[data-src-start]`）を前から並べる */
function wrappers(node: AstNode): AstNode[] {
  return flatten(node).filter((n) => n.props?.[SOURCE_START_ATTR] !== undefined);
}

async function marked(source: string): Promise<AstNode> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  return markSourcePosition(body) as unknown as AstNode;
}

describe('件2: offset 0 と「位置が無い」を取り違えない', () => {
  /*
   * 経路は2つある。**片方だけ塞いでも黙って壊れる。**
   *
   * - 包み（`source-span.ts` の text ノード）
   * - フェンスの対応表（`fence.ts` の `pre`）
   *
   * `pre` に 0 を書かないことは `./pre-mark.test.ts` が押さえているので、ここは
   * 残りの経路を埋める。
   */

  it('包みの経路: 冒頭の text ノードは位置を持たないので包まない', async () => {
    // 生テキストの先頭（offset 0）から始まる段落。`compiler.js` の真偽判定に 0 が落ちて
    // position が丸ごと消える。ここで 0 を書くと、冒頭が黙って `[0,0)` を指す
    const source = 'いろはにほへと\n\nうしろの段落。\n';
    const found = wrappers(await marked(source));

    // 後ろの段落は包まれる。冒頭のぶんだけが包まれない
    expect(found).toHaveLength(1);
    const start = found[0]!.props![SOURCE_START_ATTR];
    expect(source.slice(Number(start), Number(found[0]!.props![SOURCE_END_ATTR]))).toBe('うしろの段落。');
    expect(start).not.toBe(0);
  });

  it('包みの経路: 位置を落とす text ノードは冒頭だけではない。**その全部を包まない**', async () => {
    // 位置を落とすノードを一度に並べる。冒頭の見出し、脚注の番号、チェックボックスの
    // 後ろの空白、脚注の戻りリンクの字。**冒頭だけを塞いでも足りない**
    const source = '# 冒頭の見出し\n\nいろは[^1]にほへと\n\n- [x] 済みの項目\n\n[^1]: 脚注の本文\n';
    const { body } = await parseMarkdown(source, PARSE_OPTIONS);

    const texts = flatten(body as unknown as AstNode).filter((node) => node.type === 'text');
    const positioned = texts.filter((node) => node.position !== undefined);
    // 検査の前提。位置を落とすノードが1つも無い文書では、この it は何も見ていない
    expect(texts.length - positioned.length, '位置を落とす text ノードが1つも無い').toBeGreaterThan(0);

    // 包みの数が位置を持つ text ノードの数と揃う。**でっち上げた 0 はここで余る**
    const found = wrappers(markSourcePosition(body) as unknown as AstNode);
    expect(found).toHaveLength(positioned.length);

    for (const wrapper of found) {
      const start = Number(wrapper.props![SOURCE_START_ATTR]);
      const end = Number(wrapper.props![SOURCE_END_ATTR]);
      const shown = flatten(wrapper).find((node) => node.type === 'text')?.value ?? '';

      expect(Number.isInteger(start), `包みの開始が数でない: ${String(wrapper.props![SOURCE_START_ATTR])}`).toBe(true);
      // でっち上げた `[0,0)` は幅0の範囲として現れる。中身のある包みがそこを指したら誤り
      expect(end, `中身のある包み ${JSON.stringify(shown)} が幅0の範囲を指している`).toBeGreaterThan(start);
      // 包みの中の字と、指す先の字は重なる。**片方がもう片方を含む**
      // （記号のぶん指す先が長いことも、脚注の本文のように中の字が長いこともある）
      const slice = source.slice(start, end);
      expect(
        slice.includes(shown.trim()) || shown.includes(slice),
        `包み ${JSON.stringify(shown)} が ${JSON.stringify(slice)} を指している`,
      ).toBe(true);
    }
  });

  it('フェンスの経路: 位置が無ければ対応表を作らない', () => {
    const source = '```ts\nconst a = 1;\n```\n';
    expect(buildFenceMap({ source, position: undefined, code: 'const a = 1;\n' })).toBeNull();
  });

  it('フェンスの経路: `start` が 0 の位置は「無い」ではない', () => {
    // 位置が属性で届く面（`../render/MarkdownDiagram.vue`）では、冒頭のフェンスでも
    // `{ start: 0, … }` が渡ってくる。**0 を偽と見ると、ここだけ黙って `null` になる**
    const source = '```ts\nconst a = 1;\n```\n';
    const map = buildFenceMap({ source, position: { start: 0, end: source.length - 1 }, code: 'const a = 1;\n' });

    expect(map, '`start === 0` を「位置が無い」と取り違えている').not.toBeNull();
    expect(map!.sourceRange).toEqual({ start: 0, end: source.length - 1 });
    // 中身の先頭の字が、生テキストの `const` の頭を指す
    expect(map!.toSourceRange(0)).toEqual({ start: 6, end: 7 });
  });

  it('整形された本文: 冒頭から選んだ範囲が取れる', async () => {
    // 冒頭の段落は position を落として包まれない。それでも面の先頭の字は
    // 生テキストの先頭の字なので、照合で拾い直せていなければならない
    const source = 'いろはにほへと\n\n**強調**のある段落。\n';
    const surfaced = await previewSurface(source);

    expect(surfaced.port.toSourceRange(select(surfaced.container, 0, 3))).toEqual({ start: 0, end: 3 });
    // 冒頭の1点（キャレット）も「取れない」ではない
    expect(surfaced.port.toSourceRange(select(surfaced.container, 0, 0))).toEqual({ start: 0, end: 0 });

    const back = surfaced.port.toDomRange({ start: 0, end: 3 });
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe('いろは');
  });

  it('生テキストの面: 冒頭から選んだ範囲が取れる', () => {
    const source = 'いろはにほへと\n\nうしろの段落。\n';
    const { port, container } = plainSurface(source);

    expect(port.toSourceRange(select(container, 0, 3))).toEqual({ start: 0, end: 3 });
    // 0 は「取れない」ではない。潰れた範囲として返る
    expect(port.toSourceRange(select(container, 0, 0))).toEqual({ start: 0, end: 0 });

    const back = port.toDomRange({ start: 0, end: 3 });
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe('いろは');
  });
});

// ---------------------------------------------------------------------------
// 件3: 記号を伴う記法。position が記号を含むかは記法ごとに違う
// ---------------------------------------------------------------------------

/** text ノード1つの実測。面に出る字と、`position` が指す生テキスト */
interface TextMeasure {
  value: string;
  /** `position` の指す生テキスト。position が無ければ `null` */
  slice: string | null;
}

/** 生テキストを解析し、text ノードを前から並べて実測する */
async function measure(source: string): Promise<TextMeasure[]> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  return flatten(body as unknown as AstNode)
    .filter((node) => node.type === 'text')
    .map((node) => ({
      value: node.value ?? '',
      slice: node.position ? source.slice(node.position.start, node.position.end) : null,
    }));
}

/** 面に出る字が `value` の text ノードの実測を1つ引く */
async function measureOf(source: string, value: string): Promise<TextMeasure> {
  const found = (await measure(source)).find((item) => item.value === value);
  expect(found, `面に出る字 ${JSON.stringify(value)} の text ノードが無い`).toBeDefined();
  return found!;
}

/**
 * 記号を伴う記法の実測表。
 *
 * **`position` が記号を含むのはインラインコードだけである**（@nuxtjs/mdc 0.23.1 で実測）。
 * 強調・斜体・リンク・打ち消し・自動リンクは、どれも記号の内側どうしで揃う。
 * 「記号を持つ記法は記号を含むはずだ」という当たりの付け方が通らないので、
 * 増やすときは推測せずここへ足すこと。
 *
 * 表に入れないもの（text ノードが無い・位置が無い）は下の別の it が見る。
 */
const NOTATIONS: { name: string; source: string; shown: string; slice: string }[] = [
  { name: '**強調**', source: 'まえ\n\nいろは**強調**にほへと\n', shown: '強調', slice: '強調' },
  { name: '*斜体*', source: 'まえ\n\nいろは*斜体*にほへと\n', shown: '斜体', slice: '斜体' },
  // ここだけ記号を含む。按分するとこの2文字ぶんずれる
  { name: '`インラインコード`', source: 'まえ\n\nいろは`コード`にほへと\n', shown: 'コード', slice: '`コード`' },
  {
    name: '[ラベル](url)',
    source: 'まえ\n\nいろは[ラベル](https://example.com)にほへと\n',
    shown: 'ラベル',
    slice: 'ラベル',
  },
  {
    name: '[ラベル](url "題")',
    source: 'まえ\n\nいろは[ラベル](https://example.com "題")にほへと\n',
    shown: 'ラベル',
    slice: 'ラベル',
  },
  {
    name: '[ラベル][ref]（参照リンク）',
    source: 'まえ\n\nいろは[ラベル][ref]にほへと\n\n[ref]: https://example.com\n',
    shown: 'ラベル',
    slice: 'ラベル',
  },
  { name: '~~打ち消し~~', source: 'まえ\n\nいろは~~打ち消し~~にほへと\n', shown: '打ち消し', slice: '打ち消し' },
  {
    name: '<url>（自動リンク）',
    source: 'まえ\n\nいろは<https://example.com>にほへと\n',
    shown: 'https://example.com',
    slice: 'https://example.com',
  },
  {
    name: '生 URL（GFM の自動リンク）',
    source: 'まえ\n\nいろは https://example.com にほへと\n',
    shown: 'https://example.com',
    slice: 'https://example.com',
  },
  { name: '## 見出し', source: 'まえ\n\n## 見出しの字\n', shown: '見出しの字', slice: '見出しの字' },
  { name: '- 箇条書き', source: 'まえ\n\n- 項目の字\n', shown: '項目の字', slice: '項目の字' },
  { name: '> 引用', source: 'まえ\n\n> 引用の字\n', shown: '引用の字', slice: '引用の字' },
  { name: '表のセル', source: 'まえ\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', shown: 'a', slice: 'a' },
  { name: '- [x] チェックボックス', source: 'まえ\n\n- [x] 済みの項目\n', shown: '済みの項目', slice: '済みの項目' },
];

describe('件3: 記法ごとに position が記号を含むかを実測して列挙する', () => {
  for (const { name, source, shown, slice } of NOTATIONS) {
    it(`${name}: position は ${slice === shown ? '記号を含まない' : '記号を含む'}`, async () => {
      expect(await measureOf(source, shown)).toEqual({ value: shown, slice });
    });
  }

  it('画像 `![代替](url)`: 代替の字は text ノードにならない（属性へ抜ける）', async () => {
    const source = 'まえ\n\nいろは![代替](https://example.com/a.png)にほへと\n';
    expect((await measure(source)).some((item) => item.value === '代替')).toBe(false);
  });

  it('脚注の参照 `[^1]`: 番号の字は position を持たない', async () => {
    const source = 'まえ\n\nいろは[^1]にほへと\n\n[^1]: 脚注の本文\n';
    expect(await measureOf(source, '1')).toEqual({ value: '1', slice: null });
  });

  it('脚注の本文: 面に出る字のほうが長い（戻りのリンクのぶんの空白が付く）', async () => {
    // 記号を含むどころか**逆に短い**。長さの差を記号と決めてかかると、ここで頭が動く
    const source = 'まえ\n\nいろは[^1]にほへと\n\n[^1]: 脚注の本文\n';
    expect(await measureOf(source, '脚注の本文 ')).toEqual({ value: '脚注の本文 ', slice: '脚注の本文' });
  });
});

describe('件3: 面から選んだ範囲が、按分ではなく照合で決まる', () => {
  for (const { name, source, shown } of NOTATIONS) {
    it(`${name} の中を選ぶと、生テキストのその字を指す`, async () => {
      const surfaced = await previewSurface(source);
      const range = surfaced.port.toSourceRange(selectText(surfaced, shown));

      expect(range, `${name} の中を選んで対応が取れない`).not.toBeNull();
      // **位置ではなく字で確かめる。** 位置で書くと、ずれた値をそのまま期待値にしてしまう
      expect(source.slice(range!.start, range!.end)).toBe(shown);
    });
  }

  it('インラインコードの中の一部でもずれない（按分するとここが1〜2文字ずれる）', async () => {
    const source = 'まえ\n\nいろは`インラインコード`にほへと\n';
    const surfaced = await previewSurface(source);
    const range = surfaced.port.toSourceRange(selectText(surfaced, 'ンライ'));

    expect(source.slice(range!.start, range!.end)).toBe('ンライ');
  });
});

describe('件3: 字が見つからない記法は null を返す（推測で返さない）', () => {
  it('エスケープ `\\*`: 描かれた字が生テキストにその形で無い', async () => {
    const source = 'まえ\n\nいろは\\*星\\*にほへと\n';
    const surfaced = await previewSurface(source);

    // 面には `いろは*星*にほへと`、生テキストには `いろは\*星\*にほへと`。
    // どの字がどこから来たかを言えないので、この包みは対応の取れない領域になる
    expect(surfaced.text).toContain('いろは*星*にほへと');
    expect(surfaced.port.toSourceRange(selectText(surfaced, '*星*'))).toBeNull();
  });

  it('実体参照 `&amp;`: 同じく形が違う', async () => {
    const source = 'まえ\n\nいろは&amp;にほへと\n';
    const surfaced = await previewSurface(source);

    expect(surfaced.text).toContain('いろは&にほへと');
    expect(surfaced.port.toSourceRange(selectText(surfaced, '&'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 面を組む道具
// ---------------------------------------------------------------------------

/**
 * 面ひとつ。
 *
 * `./preview.test.ts` の同名の道具の細い版。ここで見たいのは散文の中の記法だけなので、
 * フェンス（`pre`）の組み立ては持たない。フェンスを含む面が要るなら向こうを使うこと。
 */
interface Surface {
  container: HTMLElement;
  port: PositionPort;
  /** 面に出ている字を前から繋いだもの。選択の位置はこれの中で数える */
  text: string;
}

/** AST の1ノードを DOM へ。`MDCRenderer` が要素と text ノードに対してすることの写し */
function render(node: AstNode, target: Document): Node | null {
  if (node.type === 'text') return target.createTextNode(node.value ?? '');
  if (node.type !== 'element' || !node.tag) return null;

  const element = target.createElement(node.tag);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    // 位置の口が見るのは包みの属性だけ。他は見た目の指定なので数と種類を絞る
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    element.setAttribute(key, String(value));
  }
  for (const child of node.children ?? []) {
    const rendered = render(child, target);
    if (rendered) element.append(rendered);
  }
  return element;
}

async function previewSurface(source: string): Promise<Surface> {
  const body = await marked(source);

  const container = document.createElement('div');
  for (const child of body.children ?? []) {
    const rendered = render(child, document);
    if (rendered) container.append(rendered);
  }
  document.body.append(container);

  return { container, port: createPreviewPositionPort({ container, source }), text: container.textContent ?? '' };
}

/** 生テキストの面。`../render/MarkdownSource.vue` と同じく `pre` に素で入れる */
function plainSurface(source: string): Surface {
  const container = document.createElement('pre');
  container.append(document.createTextNode(source));
  document.body.append(container);

  return { container, port: createPlainPositionPort({ container, source }), text: source };
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

beforeEach(() => {
  document.body.innerHTML = '';
});
