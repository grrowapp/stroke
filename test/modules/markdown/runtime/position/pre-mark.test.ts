/**
 * `pre` に位置の印が乗ることを固定する。
 *
 * フェンスの中の text ノードは位置を持たないので、包みだけではコードブロックの中に
 * 手が届かない。フェンス全体の範囲が `pre` に載っていれば、`fence.ts` の対応表で
 * 中の桁まで引ける。
 *
 * **この印が要るのは、`position` が DOM へ出る経路が他に無いためである。**
 * `MDCRenderer` は受け側へ `node.props` だけを渡して `node.position` を捨て、
 * `code` 属性も `MarkdownCode` が props で宣言しているため `v-bind="attrs"` から
 * 抜けて `pre` に戻らない（実測）。印が消えると、位置の口はフェンスの中を
 * 生テキストの走査で当てにいく逃げ道へ落ちる。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { describe, expect, it } from 'vitest';

import {
  SOURCE_END_ATTR,
  SOURCE_START_ATTR,
  markSourcePosition,
} from '../../../../../modules/markdown/runtime/position/source-span';

/** `modules/markdown/index.ts` の `installModule` と同じ値。片方だけ変えると意味を失う */
const PARSE_OPTIONS = {
  rehype: { plugins: { 'rehype-raw': false } },
  keepPosition: true,
} as unknown as Parameters<typeof parseMarkdown>[1];

interface Node {
  type: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: Node[];
  value?: string;
}

async function mark(markdown: string): Promise<Node> {
  const { body } = await parseMarkdown(markdown, PARSE_OPTIONS);
  return markSourcePosition(body as never) as unknown as Node;
}

function flatten(node: Node, out: Node[] = []): Node[] {
  out.push(node);
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

function pres(node: Node): Node[] {
  return flatten(node).filter((n) => n.tag === 'pre');
}

describe('フェンスの pre に位置の印が乗る', () => {
  it('印が指す範囲は、開きのフェンスから閉じのフェンスまでである', async () => {
    // 先頭に段落を置く。offset 0 から始まる要素は position を落とすため
    const src = '導入の段落。\n\n```ts\nconst a = 1;\n```\n';
    const [pre] = pres(await mark(src));

    expect(pre).toBeDefined();
    const start = Number(pre!.props?.[SOURCE_START_ATTR]);
    const end = Number(pre!.props?.[SOURCE_END_ATTR]);

    expect(src.slice(start, end)).toBe('```ts\nconst a = 1;\n```');
  });

  it('言語の指定が無いフェンスにも乗る', async () => {
    const src = '導入。\n\n```\nplain\n```\n';
    const [pre] = pres(await mark(src));

    const start = Number(pre!.props?.[SOURCE_START_ATTR]);
    const end = Number(pre!.props?.[SOURCE_END_ATTR]);

    expect(src.slice(start, end)).toBe('```\nplain\n```');
  });

  it('mermaid のフェンスにも乗る。図になる箇所こそ位置が要る', async () => {
    const src = '導入。\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n';
    const [pre] = pres(await mark(src));

    const start = Number(pre!.props?.[SOURCE_START_ATTR]);
    const end = Number(pre!.props?.[SOURCE_END_ATTR]);

    expect(src.slice(start, end)).toContain('graph TD;');
    expect(src.slice(start, end).startsWith('```mermaid')).toBe(true);
  });

  it('フェンスが複数あっても、それぞれ自分の範囲を指す', async () => {
    const src = '導入。\n\n```ts\nfirst\n```\n\n段落。\n\n```js\nsecond\n```\n';
    const found = pres(await mark(src));

    expect(found).toHaveLength(2);
    const sliced = found.map((pre) =>
      src.slice(
        Number(pre.props?.[SOURCE_START_ATTR]),
        Number(pre.props?.[SOURCE_END_ATTR]),
      ),
    );

    expect(sliced[0]).toContain('first');
    expect(sliced[1]).toContain('second');
  });

  it('位置を持たない pre には印を付けない。無い値を 0 として書かない', async () => {
    // offset 0 から始まる要素は position を落とす（`compiler.js` の真偽判定に 0 が落ちる）
    const src = '```ts\nconst a = 1;\n```\n';
    const [pre] = pres(await mark(src));

    expect(pre).toBeDefined();
    expect(pre!.props?.[SOURCE_START_ATTR]).toBeUndefined();
    expect(pre!.props?.[SOURCE_END_ATTR]).toBeUndefined();
  });

  it('もとの属性を落とさない', async () => {
    const src = '導入。\n\n```ts\nconst a = 1;\n```\n';
    const [pre] = pres(await mark(src));

    expect(pre!.props?.language).toBe('ts');
    expect(pre!.props?.code).toBe('const a = 1;\n');
  });

  it('フェンス以外の要素には印を付けない。属性で DOM を膨らませない', async () => {
    const src = '導入の段落。\n\n## 見出し\n\n- 箇条書き\n';
    const marked = await mark(src);

    const stamped = flatten(marked).filter(
      (n) => n.type === 'element' && n.tag !== 'span' && n.props?.[SOURCE_START_ATTR] !== undefined,
    );

    expect(stamped).toHaveLength(0);
  });

  it('もとの AST を書き換えない。二度目の描画で二重にならない', async () => {
    const src = '導入。\n\n```ts\nconst a = 1;\n```\n';
    const { body } = await parseMarkdown(src, PARSE_OPTIONS);

    const before = pres(body as unknown as Node)[0];
    expect(before!.props?.[SOURCE_START_ATTR]).toBeUndefined();

    markSourcePosition(body as never);

    const after = pres(body as unknown as Node)[0];
    expect(after!.props?.[SOURCE_START_ATTR]).toBeUndefined();
  });
});
