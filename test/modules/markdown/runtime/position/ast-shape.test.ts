/**
 * **ここはパーサが返す形を固定する。位置の検査は隣の6本。**
 *
 * `./preview.test.ts` も `./fence.test.ts` も `./edge-cases.test.ts` も、見ているのは
 * 「**位置**が正しく引けるか」である。この束が見るのは「**AST がどんな形で降りてくるか**」で、
 * 位置の話ではない（`openspec/changes/adr0017-sub-add-detection-assumptions/design.md`
 * の決定1）。
 *
 * **なぜ要るか。** 検知力を測ったとき、`@nuxtjs/mdc` の出力が実際に変わったのに143本すべてが
 * 通過した変異が3件あった。テストはフェンスの幾何と text ノードの位置をよく固めていたが、
 * **AST の構造を何も固めていなかった**。3件はいずれも位置の対応の土台を静かに壊す。
 *
 * 1. **`li` の段落ほどき**……止めると `li` の直下に `p` が生え、`preview.ts` が歩く DOM も
 *    面に出る字も変わる
 * 2. **改行だけの text ノードの除去**……止めると `ul` / `li` / `blockquote` / `table` に
 *    `\n` のノードが挿さり、**面の軸が伸びて以降のオフセットが全部ずれる**
 * 3. **見出しの id**……本家写しの見た目とアンカーの一致がここに乗る
 *
 * **落ちたら「意図した変更か」を人が判断すること。** `@nuxtjs/mdc` の正当なマイナー更新でも
 * ここは落ちうる（design.md の R3）。だから各テストは**何を固定しているか**を名前で書く。
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { describe, expect, it } from 'vitest';

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

async function parse(source: string): Promise<AstNode> {
  const { body } = await parseMarkdown(source, PARSE_OPTIONS);
  return body as unknown as AstNode;
}

function flatten(node: AstNode, out: AstNode[] = []): AstNode[] {
  out.push(node);
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

/** 子の並びを「タグ名（text は `text`）」で表したもの。入れ子は見ない */
function shapeOf(node: AstNode): string[] {
  return (node.children ?? []).map((child) => (child.type === 'text' ? 'text' : (child.tag ?? '?')));
}

/** そのタグの要素を前から */
function elements(root: AstNode, tag: string): AstNode[] {
  return flatten(root).filter((node) => node.tag === tag);
}

/** 面に出る字を前から繋いだもの。`MDCRenderer` が描く text ノードの並びと同じ */
function textOf(root: AstNode): string {
  return flatten(root)
    .filter((node) => node.type === 'text')
    .map((node) => node.value ?? '')
    .join('');
}

// ---------------------------------------------------------------------------
// 固定するもの（下の毒見が同じ関数を通る）
// ---------------------------------------------------------------------------

/** `li` の中に在る `p` の数 */
function paragraphsInListItems(root: AstNode): number {
  return elements(root, 'li').reduce((count, item) => count + elements(item, 'p').length, 0);
}

/** 空白と改行だけでできた text ノードの値を前から */
function blankTexts(root: AstNode): string[] {
  return flatten(root)
    .filter((node) => node.type === 'text' && node.value !== undefined && /^\s+$/.test(node.value))
    .map((node) => node.value ?? '');
}

/** 見出しの id を前から */
function headingIds(root: AstNode): string[] {
  return flatten(root)
    .filter((node) => typeof node.tag === 'string' && /^h[1-6]$/.test(node.tag))
    .map((node) => String(node.props?.id ?? ''));
}

// ---------------------------------------------------------------------------
// 1. `li` の段落ほどき
// ---------------------------------------------------------------------------

/**
 * **`li` の中身は素の字で降りてくる。** CommonMark の HTML は項目の中身を `p` で包むが、
 * `@nuxtjs/mdc` はそれをほどく（実測）。
 *
 * ほどきが止まると `li` の直下に `p` が生え、`./preview.ts` が歩く DOM の形も、面に出る字も
 * 変わる。位置の対応は面の軸（器の中の text ノードを前から繋いだ文字の並び）の上で数えるので、
 * **軸そのものが別物になる。**
 */
describe('`li` の中身は `p` で包まれない（段落ほどき）', () => {
  it('項目が1つの段落なら、`li` の直下は text だけ', async () => {
    const body = await parse('まえ\n\n- 項目\n- 次の項目\n');

    expect(paragraphsInListItems(body)).toBe(0);
    expect(elements(body, 'li').map(shapeOf)).toEqual([['text'], ['text']]);
  });

  it('番号付きの `ol` でも同じ', async () => {
    const body = await parse('まえ\n\n1. 一\n2. 二\n');

    expect(paragraphsInListItems(body)).toBe(0);
    expect(elements(body, 'li').map(shapeOf)).toEqual([['text'], ['text']]);
  });

  it('項目の中に段落が2つあっても `p` にならない。`br` で継がれる', async () => {
    // ほどきが止まると、ここが `[['p', 'p'], ['text']]` になる
    const body = await parse('まえ\n\n- 親\n\n  段落2\n\n- 次\n');

    expect(paragraphsInListItems(body)).toBe(0);
    expect(elements(body, 'li').map(shapeOf)).toEqual([['text', 'br', 'text'], ['text']]);
  });

  it('入れ子のリストでも `p` は生えない', async () => {
    const body = await parse('まえ\n\n- 親\n  - 子\n');

    expect(paragraphsInListItems(body)).toBe(0);
    expect(elements(body, 'li').map(shapeOf)).toEqual([['text', 'ul'], ['text']]);
  });

  it('チェックボックスの項目は `input` と字が並ぶ（`p` は挟まらない）', async () => {
    const body = await parse('まえ\n\n- [x] やった\n');

    expect(paragraphsInListItems(body)).toBe(0);
    expect(elements(body, 'li').map(shapeOf)).toEqual([['input', 'text', 'text']]);
  });

  it('**引用はほどかれない。** `blockquote` の中は `p` のまま', async () => {
    // ほどきは `li` だけの話である。ここまで一緒にほどくと、引用の中の段落が潰れる
    const body = await parse('まえ\n\n> 引用\n> つづき\n');

    expect(elements(body, 'blockquote').map(shapeOf)).toEqual([['p']]);
  });
});

// ---------------------------------------------------------------------------
// 2. 改行だけの text ノードの除去
// ---------------------------------------------------------------------------

/**
 * **入れ物の中に `\n` の text ノードは残らない。**
 *
 * HTML としての markdown 出力は `<ul>\n<li>…</li>\n</ul>` のように要素の間へ改行を挟むが、
 * `@nuxtjs/mdc` はその text ノードを落とす（実測）。
 *
 * **落とすのをやめると、面の軸が伸びる。** 位置の対応は「器の中の text ノードを前から
 * 繋いだ文字の並び」の上で数えるので（`./preview.ts`）、`\n` が1つ挿さるたびに**それ以降の
 * オフセットがずれる**。包みの中の字と生テキストの照合は包みごとに行うので、ずれても
 * `null` に倒れず**黙って隣を指しうる**。
 */
describe('入れ物の中に改行だけの text ノードが残らない', () => {
  const 入れ物: [string, string][] = [
    ['`ul` と `li`', 'まえ\n\n- 項目\n- 次の項目\n'],
    ['`ol` と `li`', 'まえ\n\n1. 一\n2. 二\n'],
    ['入れ子のリスト', 'まえ\n\n- 親\n  - 子\n'],
    ['`blockquote`', 'まえ\n\n> 引用\n> つづき\n'],
    ['`table`（`thead` / `tbody` / `tr` / `th` / `td`）', 'まえ\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'],
  ];

  it.each(入れ物)('%s の中に空白だけの text ノードが無い', async (_name, source) => {
    expect(blankTexts(await parse(source))).toEqual([]);
  });

  it('面に出る字は、入れ物のぶんの改行を含まない', async () => {
    // ここが `まえ項目\n次の項目` になったら、`\n` のぶんだけ以降のオフセットがずれている
    const body = await parse('まえ\n\n- 項目\n- 次の項目\n');

    expect(textOf(body)).toBe('まえ項目次の項目');
  });

  it('**字としての改行は残る。** 落とすのは入れ物の隙間だけ', async () => {
    // 段落の中の改行（soft break）は text ノードの値の中に在る。これまで落とすと、
    // 包みの中の字と生テキストの字数が合わなくなる
    const body = await parse('まえ\n\nいち\nに\n');

    expect(textOf(body)).toBe('まえいち\nに');
  });
});

// ---------------------------------------------------------------------------
// 3. 見出しの id
// ---------------------------------------------------------------------------

/**
 * **見出しの id は本文から作られる。** 英字を小文字へ落とし、空白の連なりを `-` 1つにし、
 * 記号を落とす。同じ字の見出しが続けば `-1` から番号が付く（実測）。
 *
 * 日本語はそのまま残る（`encodeURI` もされない）。
 */
describe('見出しの id の作り方', () => {
  const 見出し: [string, string, string][] = [
    ['英字は小文字へ落ちる', '## Hello\n', 'hello'],
    ['空白は `-` になる', '## Hello World\n', 'hello-world'],
    ['空白が続いても `-` は1つ', '## a  b\n', 'a-b'],
    ['記号は落ちる', '## Hello World!\n', 'hello-world'],
    ['日本語はそのまま残る', '## 日本語だけ\n', '日本語だけ'],
    ['日本語と英字が混ざっても規則は同じ', '## 見出しの 字 A-B\n', '見出しの-字-a-b'],
  ];

  it.each(見出し)('%s', async (_name, heading, id) => {
    expect(headingIds(await parse(`まえ\n\n${heading}`))).toEqual([id]);
  });

  it('同じ字の見出しが並ぶと、2つめから番号が付く', async () => {
    expect(headingIds(await parse('まえ\n\n## 同じ\n\n## 同じ\n\n## 同じ\n'))).toEqual(['同じ', '同じ-1', '同じ-2']);
  });

  it('見出しの段（h1〜h6）が変わっても id の作り方は同じ', async () => {
    expect(headingIds(await parse('まえ\n\n# Hello World\n\n###### Hello World\n'))).toEqual([
      'hello-world',
      'hello-world-1',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 毒見
// ---------------------------------------------------------------------------

/**
 * **上の3つが本当に落とせるかを確かめる。**
 *
 * 変異は**解析の結果**へ加える。パーサ本体（`node_modules/@nuxtjs/mdc`）は書き換えない
 * ——この作業ツリーの `node_modules` は他の作業ツリーと同じ実体へハードリンクされており
 * （実測。`stat` のリンク数が9）、書き換えると**他の実行を巻き込む**
 * （`openspec/changes/adr0017-sub-add-detection-assumptions/design.md` の決定4）。
 *
 * 変異させるのは、上のテストが通る「いまの形」を、パーサの手当てが止まったときの形へ
 * 戻したものである。それを上と同じ関数へ通して、**赤くなることを見る。**
 */

/** `li` の中身を `p` で包み直す（＝段落ほどきが止まった形） */
function rewrapListItems(root: AstNode): AstNode {
  const copy = structuredClone(root);
  for (const item of elements(copy, 'li')) {
    item.children = [{ type: 'element', tag: 'p', props: {}, children: item.children ?? [] }];
  }
  return copy;
}

/** 入れ物の子の間へ `\n` の text ノードを挿す（＝改行の除去が止まった形） */
function injectNewlines(root: AstNode): AstNode {
  const copy = structuredClone(root);
  const 入れ物 = ['ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tr'];

  for (const node of flatten(copy)) {
    if (!node.tag || !入れ物.includes(node.tag)) continue;
    const children = node.children ?? [];
    if (children.length === 0) continue;
    node.children = children.flatMap((child) => [{ type: 'text', value: '\n' }, child]);
  }
  return copy;
}

/** 見出しの id を素の本文に戻す（＝小文字化も記号落としも止まった形） */
function rawHeadingIds(root: AstNode): AstNode {
  const copy = structuredClone(root);
  for (const heading of flatten(copy).filter((node) => typeof node.tag === 'string' && /^h[1-6]$/.test(node.tag))) {
    heading.props = { ...heading.props, id: textOf(heading) };
  }
  return copy;
}

describe('毒見: 変異させた AST を通すと落ちる', () => {
  const LIST = 'まえ\n\n- 項目\n- 次の項目\n';

  it('`li` の段落ほどきを止めると、`li` の中に `p` が現れる', async () => {
    const body = await parse(LIST);
    expect(paragraphsInListItems(body), '変異の前は 0 でなければならない').toBe(0);

    const broken = rewrapListItems(body);
    expect(paragraphsInListItems(broken)).toBe(2);
    expect(elements(broken, 'li').map(shapeOf)).toEqual([['p'], ['p']]);
  });

  it('改行の除去を止めると、空白だけの text ノードが現れて面の軸が伸びる', async () => {
    const body = await parse(LIST);
    expect(blankTexts(body), '変異の前は空でなければならない').toEqual([]);

    const broken = injectNewlines(body);
    expect(blankTexts(broken).length).toBeGreaterThan(0);
    // **これが「以降のオフセットが全部ずれる」の正体である**
    expect(textOf(broken)).not.toBe(textOf(body));
    expect(textOf(broken).length).toBeGreaterThan(textOf(body).length);
  });

  it('id の作り方を変えると、見出しの id が変わる', async () => {
    const body = await parse('まえ\n\n## Hello World!\n');
    expect(headingIds(body), '変異の前は作られた id でなければならない').toEqual(['hello-world']);

    expect(headingIds(rawHeadingIds(body))).toEqual(['Hello World!']);
  });
});

// ---------------------------------------------------------------------------
// 効かない場所
// ---------------------------------------------------------------------------

/**
 * **`./plain.test.ts` に検知を足しても効かない。それでよい**（design.md の R5）。
 *
 * 生テキストの面（`../render/MarkdownSource.vue`）は `parseMarkdown` を通らない。DOM と
 * 文字列の対応を見るだけなので、パーサの構造が変わっても何も起きない。あそこはパーサの
 * 変化を捉える役ではなく、恒等では済まない部分（`Range` の端・text ノードの分かれ方・
 * 器の外）を固定する役である。
 *
 * それを忘れて向こうへ AST の検査を足すと、**解析を通らない面に解析の前提を置く**ことに
 * なり、読む人が「ここもパーサに追随する」と誤解する。パーサの形はこのファイルが持つ。
 */
