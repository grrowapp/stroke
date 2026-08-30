/**
 * 文書の markdown は本家のファイルから読んで出すもので、こちらが用意した値ではない。
 * 自前のサニタイズを置かず `@nuxtjs/mdc` の parse に任せる以上、何が落ちるかを固定する。
 *
 * MDC の既定サニタイズ（`validateProps`）は**属性しか落とさない**。`<img>` も
 * `<script>` もタグとしては残る。生 HTML を描かないのは `rehype-raw` を切っているため
 * であって、既定の挙動ではない。`nuxt.config.ts` の `mdc.rehypePlugins` を外すと、
 * ここが通らなくなる。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { describe, expect, it } from 'vitest';

/** `nuxt.config.ts` の `mdc.rehypePlugins` と同じ。片方だけ変えると意味を失う */
const PARSE_OPTIONS = { rehype: { plugins: { 'rehype-raw': false } } } as const;

interface AstNode {
  type: string;
  tag?: string;
  props?: Record<string, unknown>;
  children?: AstNode[];
  value?: string;
}

async function parse(markdown: string): Promise<AstNode> {
  const { body } = await parseMarkdown(markdown, PARSE_OPTIONS);
  return body as unknown as AstNode;
}

/** 木を掘って最初に見つかった tag のノードを返す */
function find(node: AstNode, tag: string): AstNode | undefined {
  if (node.tag === tag) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, tag);
    if (hit) return hit;
  }
  return undefined;
}

/** 木を平らにしてテキストを繋げる。タグがテキストとして漏れていないかを見る */
function textOf(node: AstNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

describe('生 HTML は描かない', () => {
  it('`<img>` は要素にならない', async () => {
    const ast = await parse('ふつうの文\n\n<img src="x" onerror="alert(1)">\n');

    expect(find(ast, 'img')).toBeUndefined();
    expect(textOf(ast)).toBe('ふつうの文');
  });

  it('`<script>` は要素にならず、本文も残らない', async () => {
    const ast = await parse('ふつうの文\n\n<script>alert(1)</script>\n');

    expect(find(ast, 'script')).toBeUndefined();
    expect(textOf(ast)).not.toContain('alert');
  });

  it('生 HTML を落としても、その前後の markdown は残る', async () => {
    const ast = await parse('**太字**\n\n<img src="x">\n\n[リンク](https://example.com)\n');

    expect(find(ast, 'strong')).toBeDefined();
    expect(find(ast, 'a')).toBeDefined();
  });
});

describe('markdown 記法から来る危険な値は落ちる', () => {
  it('`javascript:` の href は除去される。リンク自体は残る', async () => {
    const ast = await parse('[押す](javascript:alert(1))\n');
    const anchor = find(ast, 'a');

    expect(anchor).toBeDefined();
    expect(anchor?.props).not.toHaveProperty('href');
  });
});

describe('MDC の parse が保つもの', () => {
  it('強調・リンク・表は落ちない', async () => {
    const ast = await parse(
      '**太字**と[リンク](https://example.com)\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n',
    );

    expect(find(ast, 'strong')).toBeDefined();
    expect(find(ast, 'a')?.props).toMatchObject({ href: 'https://example.com' });
    expect(find(ast, 'table')).toBeDefined();
    expect(find(ast, 'td')).toBeDefined();
  });

  it('見出しにアンカーリンクを付けない（`nuxt.config.ts` の `anchorLinks: false`）', async () => {
    const ast = await parse('## 見出し\n');
    const heading = find(ast, 'h2');

    expect(heading).toBeDefined();
    expect(find(heading!, 'a')).toBeUndefined();
  });
});
