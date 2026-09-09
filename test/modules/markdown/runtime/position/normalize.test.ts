/**
 * 渡された文字列と、解析に使われる文字列との写像（`#markdown/position/normalize`）を固定する。
 *
 * ここが崩れると、位置は `null` に倒れず**黙って別の場所を返す**。実測では、CRLF を含む
 * 文書で3つめの段落の `x` を選ぶと2つめの段落の `x` が返り、front matter を持つ文書で
 * 本文の `b` を選ぶと front matter の `b` が返った。返る字が同じなので受け取る側から見えない。
 *
 * **`parseMarkdown` が実際に解析した文字列と一致するか**は
 * `./edge-cases.test.ts` が実物の解析結果で押さえる。ここは写像そのものの算術を見る。
 */
import { describe, expect, it, vi } from 'vitest';

import { createSourceMapping } from '../../../../../modules/markdown/runtime/position/normalize';

/** `ab\ncd\n\nx\n\nx\n` の CRLF 版。3つめの `x` は LF 側の 10、渡された側の 13 */
const CRLF = 'ab\r\ncd\r\n\r\nx\r\n\r\nx\r\n';
/**
 * front matter を持つ。**`parseFrontMatter` は区切りの改行を1つ残す**ので、
 * 解析側は `'\nab\n\n**b**\n'`（11文字）。落ちる量は 23 - 11 = 12（実測）。
 */
const FRONT = '---\na: b\n---\nab\n\n**b**\n';

describe('写像が作れる場合', () => {
  it('どちらも無ければ恒等になる', () => {
    const m = createSourceMapping('ab\n\nx\n');
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('ab\n\nx\n');
    expect(m!.toGiven({ start: 4, end: 5 })).toEqual({ start: 4, end: 5 });
    expect(m!.toParsed({ start: 4, end: 5 })).toEqual({ start: 4, end: 5 });
  });

  it('CRLF は詰まったぶんだけ後ろへずれる', () => {
    const m = createSourceMapping(CRLF);
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('ab\ncd\n\nx\n\nx\n');

    // 3つめの段落の `x`。解析側 10 → 渡された側 15（`\r` が5つ先行する）
    expect(m!.toGiven({ start: 10, end: 11 })).toEqual({ start: 15, end: 16 });
    expect(m!.toParsed({ start: 15, end: 16 })).toEqual({ start: 10, end: 11 });
  });

  it('front matter は定数ぶん前へずれる', () => {
    const m = createSourceMapping(FRONT);
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('\nab\n\n**b**\n');

    // 落ちた前置きは 12 文字（`---\na: b\n---`。**末尾の改行は残る**）
    // 本文の `ab` は解析側 1..3、渡された側 13..15
    expect(m!.toGiven({ start: 1, end: 3 })).toEqual({ start: 13, end: 15 });
    expect(m!.toParsed({ start: 13, end: 15 })).toEqual({ start: 1, end: 3 });
  });

  it('CRLF と front matter が両方あっても合う', () => {
    const m = createSourceMapping('---\r\na: b\r\n---\r\nab\r\n\r\n**b**\r\n');
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('\nab\n\n**b**\n');

    const given = m!.toGiven({ start: 1, end: 3 });
    expect(given).not.toBeNull();
    // 往復して戻る
    expect(m!.toParsed(given!)).toEqual({ start: 1, end: 3 });
  });

  it('空の front matter は落ちない', () => {
    // `---\n---` は front matter として扱われない（実測。tasks 1.3）
    const m = createSourceMapping('---\n---\nab\n\nx\n');
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('---\n---\nab\n\nx\n');
  });

  it('本文の水平線は落ちない', () => {
    const m = createSourceMapping('ab\n\n---\n\nx\n');
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('ab\n\n---\n\nx\n');
  });

  it('front matter だけで本文が無い', () => {
    const m = createSourceMapping('---\na: b\n---\n');
    expect(m).not.toBeNull();
    // 区切りの改行だけが残る
    expect(m!.parsed).toBe('\n');
    expect(m!.toGiven({ start: 0, end: 0 })).toEqual({ start: 12, end: 12 });
  });

  it('空文字列', () => {
    const m = createSourceMapping('');
    expect(m).not.toBeNull();
    expect(m!.parsed).toBe('');
    expect(m!.toGiven({ start: 0, end: 0 })).toEqual({ start: 0, end: 0 });
    expect(m!.toParsed({ start: 0, end: 0 })).toEqual({ start: 0, end: 0 });
  });
});

describe('境界', () => {
  it('先頭と末尾を指せる', () => {
    const m = createSourceMapping(CRLF);
    expect(m!.toGiven({ start: 0, end: 0 })).toEqual({ start: 0, end: 0 });
    // 解析側の末尾（12）は渡された側の末尾（18）
    expect(m!.toGiven({ start: 12, end: 12 })).toEqual({ start: 18, end: 18 });
  });

  it('`\\r\\n` の直前と直後', () => {
    const m = createSourceMapping(CRLF);
    // 解析側 2 は最初の `\n`。渡された側では `\r` を飛ばして 3
    expect(m!.toGiven({ start: 2, end: 3 })).toEqual({ start: 3, end: 4 });
    // **`x` を選ぶと `\r` を巻き込まない**（半開区間の終わりは直前の文字の終わりへ写す）
    expect(m!.toGiven({ start: 7, end: 8 })).toEqual({ start: 10, end: 11 });
    // 渡された側 2（`\r` そのもの）は解析側に対応が無い
    expect(m!.toParsed({ start: 2, end: 3 })).toBeNull();
  });

  it('落ちた前置きの直後', () => {
    const m = createSourceMapping(FRONT);
    expect(m!.toGiven({ start: 0, end: 0 })).toEqual({ start: 12, end: 12 });
    // 前置きの中は解析側に対応が無い
    expect(m!.toParsed({ start: 4, end: 5 })).toBeNull();
    // 区切りの改行（解析側 0）は渡された側 12 を指す
    expect(m!.toGiven({ start: 0, end: 1 })).toEqual({ start: 12, end: 13 });
  });
});

describe('答えられないときは null を返す', () => {
  it('範囲が負', () => {
    const m = createSourceMapping('ab\n');
    expect(m!.toGiven({ start: -1, end: 1 })).toBeNull();
    expect(m!.toParsed({ start: -1, end: 1 })).toBeNull();
  });

  it('開始が終了より後ろ', () => {
    const m = createSourceMapping('ab\n');
    expect(m!.toGiven({ start: 2, end: 1 })).toBeNull();
    expect(m!.toParsed({ start: 2, end: 1 })).toBeNull();
  });

  it('範囲が長さを超える', () => {
    const m = createSourceMapping('ab\n');
    expect(m!.toGiven({ start: 0, end: 99 })).toBeNull();
    expect(m!.toParsed({ start: 0, end: 99 })).toBeNull();
  });

  it('整数でない', () => {
    const m = createSourceMapping('ab\n');
    expect(m!.toGiven({ start: 0.5, end: 1 })).toBeNull();
    expect(m!.toParsed({ start: 0.5, end: 1 })).toBeNull();
  });
});


describe('接尾辞でなければ写像を作らない', () => {
  /**
   * **実物の `parseFrontMatter` では踏めない。** front matter は先頭からしか落ちないので、
   * 返る文字列は必ず接尾辞になる。このガードは**パーサが変わったときのための防具**であり、
   * 実物を通す入力では一度も効かない（実測: ガードを外しても他の15本は全部通った）。
   *
   * したがって偽の実装を差して踏む。ここを消すと、基準の違う位置を正しいかのように
   * 返す側へ倒れる。
   */
  it('返った文字列が接尾辞でなければ null', async () => {
    vi.resetModules();
    vi.doMock('remark-mdc', () => ({
      parseFrontMatter: () => ({ content: 'まったく別の文字列', data: {} }),
    }));

    const { createSourceMapping: withFake } = await import(
      '../../../../../modules/markdown/runtime/position/normalize'
    );
    expect(withFake('ab\n\nx\n')).toBeNull();

    vi.doUnmock('remark-mdc');
    vi.resetModules();
  });

  it('例外を投げたら null（依存が消えた場合）', async () => {
    vi.resetModules();
    vi.doMock('remark-mdc', () => ({
      parseFrontMatter: () => {
        throw new Error('依存が解決できない');
      },
    }));

    const { createSourceMapping: withFake } = await import(
      '../../../../../modules/markdown/runtime/position/normalize'
    );
    expect(withFake('ab\n\nx\n')).toBeNull();

    vi.doUnmock('remark-mdc');
    vi.resetModules();
  });
});
