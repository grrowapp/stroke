// @vitest-environment happy-dom
/**
 * 生テキストの面の位置の口（`#markdown/position/plain`）を固定する。
 *
 * 文字の対応は恒等なので、ここで測るのは**恒等では済まない部分**である。
 *
 * - `Range` の端は「ノードとその中のオフセット」で表されるので、器の先頭からの文字数へ
 *   落とす手当てが要る。端が要素なら値は子ノードの番号で、文字数ですらない
 * - 面の中の text ノードが1つとは限らない。分かれていても同じ答えになること
 * - 対応が取れない場面で黙って通さないこと（器の外・範囲の外・器の文字列が渡した
 *   生テキストと違う）
 *
 * DOM が要るので happy-dom で動かす。
 *
 * **ここはパーサを通らない。だからパーサの変化を捉える力を持たない。それでよい。**
 *
 * 生テキストの面は `parseMarkdown` を呼ばず、DOM と文字列の対応を見るだけである。
 * `@nuxtjs/mdc` の出力がどう変わってもこの束は何も言わないが、それは穴ではなく役割の
 * 違いである（`openspec/changes/adr0017-sub-add-detection-assumptions/design.md` の R5）。
 * **AST の形を固定する検査をここへ足さないこと。** 解析を通らない面に解析の前提を置くと、
 * 読む人が「ここもパーサに追随する」と誤解する。パーサの形は `./ast-shape.test.ts` が持つ。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createPlainPositionPort } from '../../../../../modules/markdown/runtime/position/plain';
import type { PositionPort } from '../../../../../modules/markdown/runtime/position/types';

interface Surface {
  /** 生テキストを入れた器 */
  container: HTMLElement;
  /** 器の中の text ノード（前から順） */
  nodes: Text[];
  port: PositionPort;
}

/**
 * 面を組む。`splits` を渡すとその位置で text ノードを分ける。
 *
 * 分けられるようにしてあるのは、面の中の text ノードが1つだと決め打っていないかを
 * 測るため。空の断片は作らない（中身が無い面は text ノードを1つも持たない）。
 */
function surface(source: string, splits: number[] = []): Surface {
  const container = document.createElement('pre');
  const bounds = [0, ...splits, source.length];
  const nodes: Text[] = [];

  for (let index = 0; index < bounds.length - 1; index += 1) {
    const value = source.slice(bounds[index], bounds[index + 1]);
    if (value === '') continue;
    const node = document.createTextNode(value);
    container.appendChild(node);
    nodes.push(node);
  }

  document.body.appendChild(container);
  return { container, nodes, port: createPlainPositionPort({ container, source }) };
}

function domRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Range {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

/** 器の中身だけを選ぶ（端が要素になる形。ブラウザの「すべて選択」がこれ） */
function contentsRange(container: Node): Range {
  const range = document.createRange();
  range.selectNodeContents(container);
  return range;
}

/** ふつうの散文。改行を2つ含む */
const SOURCE = '# 見出し\n\n本文の一行目\n';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('DOM の範囲 → 生テキストの位置', () => {
  it('途中の範囲', () => {
    const { nodes, port } = surface(SOURCE);
    const start = SOURCE.indexOf('本文');
    expect(port.toSourceRange(domRange(nodes[0]!, start, nodes[0]!, start + 2))).toEqual({
      start,
      end: start + 2,
    });
  });

  it('文書のいちばん先頭（offset 0）から', () => {
    const { nodes, port } = surface(SOURCE);
    expect(port.toSourceRange(domRange(nodes[0]!, 0, nodes[0]!, 1))).toEqual({ start: 0, end: 1 });
  });

  it('いちばん末尾まで', () => {
    const { nodes, port } = surface(SOURCE);
    const start = SOURCE.length - 3;
    expect(port.toSourceRange(domRange(nodes[0]!, start, nodes[0]!, SOURCE.length))).toEqual({
      start,
      end: SOURCE.length,
    });
  });

  it('全体（端が要素になる形でも数えられる）', () => {
    const { container, port } = surface(SOURCE);
    // `selectNodeContents` の端は器そのもので、オフセットは子ノードの番号（0 と 1）。
    // 文字数として読むと 0〜1 になってしまう
    const range = contentsRange(container);
    expect(range.startContainer).toBe(container);
    expect(range.endOffset).toBe(container.childNodes.length);
    expect(port.toSourceRange(range)).toEqual({ start: 0, end: SOURCE.length });
  });

  it('改行をまたぐ', () => {
    const { nodes, port } = surface(SOURCE);
    const start = SOURCE.indexOf('見出し');
    const end = SOURCE.indexOf('本文') + 2;
    const range = port.toSourceRange(domRange(nodes[0]!, start, nodes[0]!, end));

    expect(range).toEqual({ start, end });
    expect(SOURCE.slice(start, end)).toContain('\n\n');
  });

  it('潰れた範囲（選択されていない）は、その1点を指す空の範囲', () => {
    const { nodes, port } = surface(SOURCE);
    expect(port.toSourceRange(domRange(nodes[0]!, 4, nodes[0]!, 4))).toEqual({ start: 4, end: 4 });
  });
});

describe('オフセットは UTF-16 の単位', () => {
  // `𠮷` はサロゲートペアで2つ、`あ` は1つ、`🎉` は2つ
  const source = 'あ𠮷野家🎉\n';

  it('サロゲートペアは2つに数える', () => {
    const { nodes, port } = surface(source);

    expect(source.indexOf('𠮷')).toBe(1);
    expect(port.toSourceRange(domRange(nodes[0]!, 1, nodes[0]!, 3))).toEqual({ start: 1, end: 3 });
    // 上位と下位のあいだも位置として数える（文字の途中だが、口はそのまま返す）
    expect(port.toSourceRange(domRange(nodes[0]!, 1, nodes[0]!, 2))).toEqual({ start: 1, end: 2 });
  });

  it('サロゲートペアを含む位置から DOM の範囲を作れる', () => {
    const { port } = surface(source);
    const range = port.toDomRange({ start: 1, end: 3 });

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('𠮷');
  });
});

describe('生テキストの位置 → DOM の範囲', () => {
  it('途中の範囲', () => {
    const { nodes, port } = surface(SOURCE);
    const start = SOURCE.indexOf('本文');
    const range = port.toDomRange({ start, end: start + 2 });

    expect(range).not.toBeNull();
    expect(range!.startContainer).toBe(nodes[0]);
    expect(range!.startOffset).toBe(start);
    expect(range!.toString()).toBe('本文');
  });

  it('先頭から', () => {
    const { port } = surface(SOURCE);
    const range = port.toDomRange({ start: 0, end: 1 });

    expect(range!.startOffset).toBe(0);
    expect(range!.toString()).toBe('#');
  });

  it('末尾まで', () => {
    const { port } = surface(SOURCE);
    const range = port.toDomRange({ start: SOURCE.length - 1, end: SOURCE.length });

    expect(range).not.toBeNull();
    expect(range!.toString()).toBe('\n');
  });

  it('全体', () => {
    const { port } = surface(SOURCE);
    const range = port.toDomRange({ start: 0, end: SOURCE.length });

    expect(range!.toString()).toBe(SOURCE);
  });
});

describe('text ノードが分かれていても同じ答えになる', () => {
  const splits = [4, 6];

  it('分かれた先のノードの中のオフセットは、器の先頭からの文字数へ直される', () => {
    const { nodes, port } = surface(SOURCE, splits);

    expect(nodes).toHaveLength(3);
    // 2つ目のノードの先頭は器の 4文字目。ノードの中の 0 をそのまま返してはならない
    expect(port.toSourceRange(domRange(nodes[1]!, 0, nodes[1]!, 2))).toEqual({ start: 4, end: 6 });
    // ノードをまたぐ範囲も1つの範囲になる
    expect(port.toSourceRange(domRange(nodes[0]!, 2, nodes[2]!, 3))).toEqual({ start: 2, end: 9 });
  });

  it('全体を選んでも器の長さになる', () => {
    const { container, port } = surface(SOURCE, splits);
    expect(port.toSourceRange(contentsRange(container))).toEqual({ start: 0, end: SOURCE.length });
  });

  it('継ぎ目は、始まりを後ろ寄り・終わりを前寄りに採る', () => {
    const { nodes, port } = surface(SOURCE, splits);
    // 4 は1つ目の末尾でも2つ目の先頭でも書ける。始まりは次のノードの先頭へ
    const from = port.toDomRange({ start: 4, end: 6 });
    expect(from!.startContainer).toBe(nodes[1]);
    expect(from!.startOffset).toBe(0);
    // 終わりは前のノードの末尾へ
    expect(from!.endContainer).toBe(nodes[1]);
    expect(from!.endOffset).toBe(2);
    expect(from!.toString()).toBe(SOURCE.slice(4, 6));
  });
});

describe('中身が空', () => {
  it('空文字列: 器の頭を指す空の範囲だけが取れる', () => {
    const { container, port } = surface('');

    expect(container.childNodes).toHaveLength(0);
    // text ノードが無いので、端になれるのは器そのものだけ
    const range = port.toDomRange({ start: 0, end: 0 });
    expect(range).not.toBeNull();
    expect(range!.startContainer).toBe(container);
    expect(range!.startOffset).toBe(0);
    expect(range!.toString()).toBe('');
    // 逆向きも 0 に潰れる
    expect(port.toSourceRange(contentsRange(container))).toEqual({ start: 0, end: 0 });
  });

  it('空文字列で 0 の外を指したら null', () => {
    const { port } = surface('');
    expect(port.toDomRange({ start: 0, end: 1 })).toBeNull();
    expect(port.toDomRange({ start: 1, end: 1 })).toBeNull();
  });

  it('空の text ノードが入っていても同じ', () => {
    const container = document.createElement('pre');
    container.appendChild(document.createTextNode(''));
    document.body.appendChild(container);
    const port = createPlainPositionPort({ container, source: '' });

    expect(port.toSourceRange(contentsRange(container))).toEqual({ start: 0, end: 0 });
    expect(port.toDomRange({ start: 0, end: 0 })).not.toBeNull();
    expect(port.toDomRange({ start: 0, end: 1 })).toBeNull();
  });
});

describe('対応が取れない場合は null を返す', () => {
  it('器の外を指す範囲', () => {
    const { container, port } = surface(SOURCE);
    const outside = document.createElement('div');
    outside.appendChild(document.createTextNode('よそ'));
    document.body.appendChild(outside);

    expect(port.toSourceRange(contentsRange(outside))).toBeNull();
    // 器を含む側（body）も外。器の中の位置は決まらない
    expect(port.toSourceRange(contentsRange(document.body))).toBeNull();
    expect(container.parentNode).toBe(document.body);
  });

  it('片側だけ器の外に出ている範囲', () => {
    const { container, nodes, port } = surface(SOURCE);
    const after = document.createElement('div');
    after.appendChild(document.createTextNode('あと'));
    document.body.appendChild(after);

    const range = document.createRange();
    range.setStart(nodes[0]!, 2);
    range.setEnd(after.firstChild!, 1);

    expect(port.toSourceRange(range)).toBeNull();
    expect(container.contains(nodes[0]!)).toBe(true);
  });

  it('器の文字列が渡した生テキストと違う（`<pre>` の直後の改行が落ちた場合）', () => {
    // 生テキストが改行で始まると、SSR の HTML を解析した時点でその1文字が落ちる。
    // 恒等で答えると以降の位置が1つずつずれるので、黙って通さない
    const source = '\n本文\n';
    const container = document.createElement('pre');
    container.appendChild(document.createTextNode(source.slice(1)));
    document.body.appendChild(container);
    const port = createPlainPositionPort({ container, source });

    expect(port.toSourceRange(contentsRange(container))).toBeNull();
    expect(port.toDomRange({ start: 0, end: 2 })).toBeNull();
  });

  it('生テキストの範囲が範囲の外', () => {
    const { port } = surface(SOURCE);

    expect(port.toDomRange({ start: -1, end: 2 })).toBeNull();
    expect(port.toDomRange({ start: 0, end: SOURCE.length + 1 })).toBeNull();
    // 端は受ける
    expect(port.toDomRange({ start: 0, end: SOURCE.length })).not.toBeNull();
    expect(port.toDomRange({ start: SOURCE.length, end: SOURCE.length })).not.toBeNull();
  });

  it('整数でない、または `start` が `end` より後ろ', () => {
    const { port } = surface(SOURCE);

    expect(port.toDomRange({ start: 1.5, end: 2 })).toBeNull();
    expect(port.toDomRange({ start: 0, end: Number.NaN })).toBeNull();
    expect(port.toDomRange({ start: 3, end: 1 })).toBeNull();
  });
});

describe('往復して元に戻る', () => {
  it('DOM の範囲 → 生位置 → DOM の範囲（同じ端に戻る）', () => {
    const { nodes, port } = surface(SOURCE);
    const original = domRange(nodes[0]!, 2, nodes[0]!, 8);

    const source = port.toSourceRange(original);
    expect(source).not.toBeNull();
    const back = port.toDomRange(source!);
    expect(back).not.toBeNull();

    expect(back!.startContainer).toBe(original.startContainer);
    expect(back!.startOffset).toBe(original.startOffset);
    expect(back!.endContainer).toBe(original.endContainer);
    expect(back!.endOffset).toBe(original.endOffset);
  });

  it('分かれた text ノードでは端の書き方が揃うが、指す文字は変わらない', () => {
    const { nodes, port } = surface(SOURCE, [4, 6]);
    // 1つ目の末尾（4文字目）から始まる範囲。戻りは2つ目の先頭という書き方になる
    const original = domRange(nodes[0]!, 4, nodes[2]!, 2);

    const source = port.toSourceRange(original)!;
    const back = port.toDomRange(source)!;

    expect(back.startContainer).toBe(nodes[1]);
    expect(back.startOffset).toBe(0);
    // 書き方は違っても、指している文字と生位置は同じ
    expect(back.toString()).toBe(original.toString());
    expect(port.toSourceRange(back)).toEqual(source);
  });

  const cases: { name: string; source: string; splits?: number[] }[] = [
    { name: '散文', source: SOURCE },
    { name: '1文字', source: 'a' },
    { name: '改行だけ', source: '\n\n\n' },
    { name: '日本語とサロゲートペア', source: 'あ𠮷野家🎉\nに\n' },
    { name: '分かれた text ノード', source: SOURCE, splits: [1, 4, 5] },
  ];

  for (const { name, source, splits } of cases) {
    it(`生位置 → DOM の範囲 → 生位置: ${name}`, () => {
      const { port } = surface(source, splits);

      for (let start = 0; start <= source.length; start += 1) {
        for (let end = start; end <= source.length; end += 1) {
          const range = port.toDomRange({ start, end });
          expect(range, `${start}-${end}`).not.toBeNull();
          expect(range!.toString(), `${start}-${end}`).toBe(source.slice(start, end));
          expect(port.toSourceRange(range!), `${start}-${end}`).toEqual({ start, end });
        }
      }
    });
  }
});
