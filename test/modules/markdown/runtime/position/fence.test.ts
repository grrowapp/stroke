/**
 * フェンスの対応表（`#markdown/position/fence`）を、**実物の解析結果**で固定する。
 *
 * 入力は手で組まない。`parseMarkdown` を通した `pre` の position と `code` をそのまま
 * 渡す。手で組んだ入力で通しても、実物とずれていれば意味がないからである
 * （食い違いそのものは `test/app/components/workspace/markdown-fence-position.test.ts`
 * が固定している。こちらはその食い違いを埋める側の検査）。
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { describe, expect, it } from 'vitest';

import { buildFenceMap, type FenceMap } from '../../../../../modules/markdown/runtime/position/fence';

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

async function parse(markdown: string): Promise<AstNode> {
  const { body } = await parseMarkdown(markdown, PARSE_OPTIONS);
  return body as unknown as AstNode;
}

function find(node: AstNode, tag: string): AstNode | undefined {
  if (node.tag === tag) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, tag);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 先頭に置く捨ての散文。
 *
 * 先頭から始まる要素は position を落とすので、対応が取れる場面を測るときは必ず前に置く。
 * 「置かないと `null` になる」ことは下の「対応が取れない場合」で別に固定する
 */
const PREFIX = 'まえ\n\n';

/** 生テキストを解析し、最初の `pre` から対応表を作る */
async function mapOf(source: string): Promise<{ map: FenceMap | null; code: string }> {
  const pre = find(await parse(source), 'pre');
  if (!pre) throw new Error('pre が無い');
  const code = String(pre.props?.code ?? '');
  return { map: buildFenceMap({ source, position: pre.position, code }), code };
}

/** 対応が取れる前提の場面用。`null` ならその場で落とす */
async function requireMapOf(source: string): Promise<{ map: FenceMap; code: string }> {
  const { map, code } = await mapOf(source);
  if (!map) throw new Error('対応表が作れなかった');
  return { map, code };
}

/**
 * 表示の1文字ずつについて、生テキストへ引いた先が同じ文字であり、
 * かつ往復して元の位置へ戻ることを確かめる。
 *
 * タブが開いた空白は生テキストではタブ1文字なので、そこだけ文字が一致しない。
 * 生テキストに実体が無い位置（足された改行・末尾）は空の範囲になり、戻る先が無いので飛ばす。
 */
function expectRoundTrip(source: string, code: string, map: FenceMap): void {
  for (let display = 0; display <= map.displayLength; display += 1) {
    const range = map.toSourceRange(display);
    expect(range, `display ${display}`).not.toBeNull();
    if (!range) continue;
    // 生テキストに実体が無い位置。戻す相手がいないので飛ばす
    if (range.start === range.end) continue;

    const shown = code.slice(display, display + 1);
    const raw = source.slice(range.start, range.end);
    expect(raw === shown || (raw === '\t' && shown === ' '), `display ${display} → ${JSON.stringify(raw)}`).toBe(true);

    const back = map.toDisplayRange(range.start);
    expect(back, `source ${range.start}`).not.toBeNull();
    // タブは表示の複数文字に開くので、戻り先は「元の位置を含む範囲」になる
    expect(back!.start <= display && display < back!.end, `display ${display} の往復`).toBe(true);
  }
}

describe('フェンスの対応表', () => {
  it('言語指定ありのフェンス: 中身の先頭が生テキストのどこかを指す', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('const a = 1;\n');
    expect(map.displayLength).toBe(code.length);
    expect(map.toSourceRange(0)).toEqual({ start: source.indexOf('const'), end: source.indexOf('const') + 1 });
    expect(map.toDisplayRange(source.indexOf('const'))).toEqual({ start: 0, end: 1 });
    expectRoundTrip(source, code, map);
  });

  it('言語指定なしのフェンスでも同じ（`language` が "text" でも対応は取れる）', async () => {
    const source = `${PREFIX}\`\`\`\nplain\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('plain\n');
    expect(map.toSourceRange(0)).toEqual({ start: source.indexOf('plain'), end: source.indexOf('plain') + 1 });
    expectRoundTrip(source, code, map);
  });

  it('情報行にメタが付いても、中身の対応は変わらない', async () => {
    const source = `${PREFIX}\`\`\`ts title="x"\nconst a = 1;\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(0)).toEqual({ start: source.indexOf('const'), end: source.indexOf('const') + 1 });
    expectRoundTrip(source, code, map);
  });

  it('開き行と閉じ行は表示に出ない。前へ・後ろへ潰す', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const open = source.indexOf('```');
    const close = source.lastIndexOf('```');

    // 開き行のどこを指しても、中身の先頭（表示 0）へ潰れる
    expect(map.toDisplayRange(open)).toEqual({ start: 0, end: 0 });
    expect(map.toDisplayRange(open + 4)).toEqual({ start: 0, end: 0 });
    // 閉じ行は末尾へ
    expect(map.toDisplayRange(close)).toEqual({ start: code.length, end: code.length });
    expect(map.toDisplayRange(map.sourceRange.end)).toEqual({ start: code.length, end: code.length });
  });
});

describe('タブは4桁のタブストップまで開く', () => {
  /** 開いた空白がどれも同じタブ1文字を指し、逆向きは桁ぶんの幅で返ること */
  const cases = [
    { body: 'a\tb', shown: 'a   b\n', display: { start: 1, end: 4 } },
    { body: 'ab\tc', shown: 'ab  c\n', display: { start: 2, end: 4 } },
    { body: 'abcd\te', shown: 'abcd    e\n', display: { start: 4, end: 8 } },
    { body: '\tx', shown: '    x\n', display: { start: 0, end: 4 } },
  ];

  for (const { body, shown, display } of cases) {
    it(`${JSON.stringify(body)} → ${JSON.stringify(shown)}`, async () => {
      const source = `${PREFIX}\`\`\`\n${body}\n\`\`\`\n`;
      const { map, code } = await requireMapOf(source);
      const tab = source.indexOf('\t');

      expect(code).toBe(shown);
      // 開いた空白はどれも1つのタブを指す
      for (let offset = display.start; offset < display.end; offset += 1) {
        expect(map.toSourceRange(offset), `display ${offset}`).toEqual({ start: tab, end: tab + 1 });
      }
      // 逆向きは開いた幅ぶんの範囲
      expect(map.toDisplayRange(tab)).toEqual(display);
      expectRoundTrip(source, code, map);
    });
  }

  it('1行に複数のタブがあっても桁が積み上がる', async () => {
    const source = `${PREFIX}\`\`\`\na\tb\tc\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const first = source.indexOf('\t');
    const second = source.indexOf('\t', first + 1);

    expect(code).toBe('a   b   c\n');
    expect(map.toDisplayRange(first)).toEqual({ start: 1, end: 4 });
    expect(map.toDisplayRange(second)).toEqual({ start: 5, end: 8 });
    expectRoundTrip(source, code, map);
  });
});

describe('器の印は各行から剥がされる', () => {
  it('リストの中のフェンス: インデントは表示に出ない', async () => {
    const source = `${PREFIX}- 項目\n\n  \`\`\`ts\n  const a = 1;\n  \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const content = source.indexOf('const');

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(0)).toEqual({ start: content, end: content + 1 });
    // 剥がされた2スペースは表示に広がりを持たない
    expect(map.toDisplayRange(content - 1)).toEqual({ start: 0, end: 0 });
    expect(map.toDisplayRange(content - 2)).toEqual({ start: 0, end: 0 });
    expectRoundTrip(source, code, map);
  });

  it('引用の中のフェンス: `> ` は表示に出ない', async () => {
    const source = `${PREFIX}> \`\`\`ts\n> const a = 1;\n> \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const content = source.indexOf('const');

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(0)).toEqual({ start: content, end: content + 1 });
    expect(map.toDisplayRange(content - 1)).toEqual({ start: 0, end: 0 });
    expect(map.toDisplayRange(content - 2)).toEqual({ start: 0, end: 0 });
    expectRoundTrip(source, code, map);
  });

  it('引用の中の空行（`>` だけの行）も対応が取れる', async () => {
    const source = `${PREFIX}> \`\`\`ts\n> a\n>\n> b\n> \`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('a\n\nb\n');
    expect(map.toSourceRange(0)).toEqual({ start: source.indexOf('> a') + 2, end: source.indexOf('> a') + 3 });
    expectRoundTrip(source, code, map);
  });

  it('リストの中の空行（インデントすら無い行）も対応が取れる', async () => {
    const source = `${PREFIX}- 項目\n\n  \`\`\`ts\n  a\n\n  b\n  \`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('a\n\nb\n');
    expectRoundTrip(source, code, map);
  });

  it('入れ子のリストでも、開き行の前に在る印がそのまま剥がされる', async () => {
    const source = `${PREFIX}- 項目\n  - 子\n\n    \`\`\`ts\n    const a = 1;\n    \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const content = source.indexOf('const');

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(0)).toEqual({ start: content, end: content + 1 });
    expectRoundTrip(source, code, map);
  });

  it('引用の中のリストでも同じ', async () => {
    const source = `${PREFIX}> - 項目\n>\n>   \`\`\`ts\n>   const a = 1;\n>   \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const content = source.indexOf('const');

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(0)).toEqual({ start: content, end: content + 1 });
    expectRoundTrip(source, code, map);
  });
});

describe('インデントとタブの併用', () => {
  it('リストの中: 開いた空白4つは器の2スペースではなくタブを指す', async () => {
    // **ここが手抜きの効かない箇所。** 器を剥がしてからタブを開くので、生テキストの
    // 桁（2スペースの後＝2桁目）から数えた空白2つではなく、0桁目から数えた空白4つになる。
    // 対応表が「剥がしてから開く」順で作られていなければ、この4つはタブを指さない
    const source = `${PREFIX}- 項目\n\n  \`\`\`ts\n  \tconst a = 1;\n  \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const tab = source.indexOf('\t');

    expect(code).toBe('    const a = 1;\n');
    for (let offset = 0; offset < 4; offset += 1) {
      expect(map.toSourceRange(offset), `display ${offset}`).toEqual({ start: tab, end: tab + 1 });
    }
    expect(map.toDisplayRange(tab)).toEqual({ start: 0, end: 4 });
    // 剥がされた2スペースは表示に広がりを持たない
    expect(map.toDisplayRange(tab - 1)).toEqual({ start: 0, end: 0 });
    expect(map.toDisplayRange(tab - 2)).toEqual({ start: 0, end: 0 });
    expectRoundTrip(source, code, map);
  });

  it('引用の中でも同じ', async () => {
    const source = `${PREFIX}> \`\`\`ts\n> \tconst a = 1;\n> \`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const tab = source.indexOf('\t');

    expect(code).toBe('    const a = 1;\n');
    expect(map.toDisplayRange(tab)).toEqual({ start: 0, end: 4 });
    expectRoundTrip(source, code, map);
  });
});

describe('オフセットは UTF-16 の単位', () => {
  it('日本語とサロゲートペアを含んでも、1文字ずつ対応する', async () => {
    const source = `${PREFIX}\`\`\`ts\n// 日本語のコメント\nconst a = "𠮷野家🎉";\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const pair = source.indexOf('𠮷');

    // サロゲートペアは2つに数える。上位と下位がそれぞれ別の位置になる
    expect(map.toDisplayRange(pair)).toEqual({ start: code.indexOf('𠮷'), end: code.indexOf('𠮷') + 1 });
    expect(map.toDisplayRange(pair + 1)).toEqual({ start: code.indexOf('𠮷') + 1, end: code.indexOf('𠮷') + 2 });
    expectRoundTrip(source, code, map);
  });

  it('タブの桁もコードポイントでなく UTF-16 で数える', async () => {
    // `𠮷` は2つ（→ タブは空白2つ）、`あ` は1つ（→ 空白3つ）。
    // コードポイントで数えるとどちらも空白3つになり、ここで落ちる
    const pair = `${PREFIX}\`\`\`\n𠮷\tx\n\`\`\`\n`;
    const wide = `${PREFIX}\`\`\`\nあ\tx\n\`\`\`\n`;

    const first = await requireMapOf(pair);
    expect(first.code).toBe('𠮷  x\n');
    expect(first.map.toDisplayRange(pair.indexOf('\t'))).toEqual({ start: 2, end: 4 });

    const second = await requireMapOf(wide);
    expect(second.code).toBe('あ   x\n');
    expect(second.map.toDisplayRange(wide.indexOf('\t'))).toEqual({ start: 1, end: 4 });

    expectRoundTrip(pair, first.code, first.map);
    expectRoundTrip(wide, second.code, second.map);
  });
});

describe('末尾の改行', () => {
  it('文書が改行で終わらなくても、閉じ行があれば普通に対応する', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\``;
    const { map, code } = await requireMapOf(source);
    const newline = source.indexOf('\n', source.indexOf('const'));

    expect(code).toBe('const a = 1;\n');
    // 表示の改行は生テキストの改行そのもの
    expect(map.toSourceRange(code.length - 1)).toEqual({ start: newline, end: newline + 1 });
    expectRoundTrip(source, code, map);
  });

  it('未閉じで末尾に改行が無い場合、足された改行は空の範囲になる', async () => {
    // `code` には必ず改行が足される（`detab(node.value + '\n')`）。生テキストに無い1文字
    // なので、指す先を作らず「広がりを持たない」ことをそのまま返す
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(code.length - 1)).toEqual({ start: source.length, end: source.length });
    expectRoundTrip(source, code, map);
  });

  it('未閉じでも末尾に改行があれば、その改行を指す', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n`;
    const { map, code } = await requireMapOf(source);
    const newline = source.indexOf('\n', source.indexOf('const'));

    expect(code).toBe('const a = 1;\n');
    expect(map.toSourceRange(code.length - 1)).toEqual({ start: newline, end: newline + 1 });
    expectRoundTrip(source, code, map);
  });
});

describe('空のフェンス', () => {
  it('中身が無ければ表示の長さは0。末尾は閉じ行の先頭へ潰れる', async () => {
    const source = `${PREFIX}\`\`\`ts\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);
    const close = source.lastIndexOf('```');

    expect(code).toBe('');
    expect(map.displayLength).toBe(0);
    expect(map.toSourceRange(0)).toEqual({ start: close, end: close });
    expect(map.toSourceRange(1)).toBeNull();
  });

  it('開いただけで閉じていない場合も対応表は作れる', async () => {
    const source = `${PREFIX}\`\`\`ts\n`;
    const { map, code } = await requireMapOf(source);

    expect(code).toBe('');
    expect(map.displayLength).toBe(0);
  });
});

describe('対応が取れない場合は null を返す', () => {
  it('4スペースのインデントコードブロック', async () => {
    // フェンスの行が無いので「開き行と閉じ行を落とす」規則が通らない。
    // position は中身だけを指し、切り出しは必ず空白から始まる
    const { map } = await mapOf(`${PREFIX}    const a = 1;\n    const b = 2;\n`);
    expect(map).toBeNull();
  });

  it('リストの中のインデントコードブロックも同じ', async () => {
    const { map } = await mapOf(`${PREFIX}- 項目\n\n      const a = 1;\n`);
    expect(map).toBeNull();
  });

  it('生テキストの先頭から始まるフェンス（position が無い）', async () => {
    // `parser/compiler.js` の `node.position?.start?.offset && …` が offset 0 を偽と見る
    const source = '```ts\nconst a = 1;\n```\n';
    const pre = find(await parse(source), 'pre');

    expect(pre?.position).toBeUndefined();
    expect(buildFenceMap({ source, position: pre?.position, code: String(pre?.props?.code ?? '') })).toBeNull();
  });

  it('CRLF を潰す前の生テキストを渡した（オフセットの基準がずれる）', async () => {
    const source = 'まえ\r\n\r\n```ts\r\nconst a = 1;\r\n```\r\n';
    const pre = find(await parse(source), 'pre');

    // 潰した後の本文なら対応が取れる
    const normalized = source.replace(/\r\n/g, '\n');
    expect(buildFenceMap({ source: normalized, position: pre?.position, code: String(pre?.props?.code ?? '') })).not.toBeNull();
    // 生ファイルのままでは切り出しがずれるので黙って通さない
    expect(buildFenceMap({ source, position: pre?.position, code: String(pre?.props?.code ?? '') })).toBeNull();
  });

  it('front matter を落とす前の生テキストを渡した', async () => {
    const source = '---\ntitle: x\n---\n\n```ts\nconst a = 1;\n```\n';
    const pre = find(await parse(source), 'pre');

    expect(buildFenceMap({ source: source.slice(16), position: pre?.position, code: String(pre?.props?.code ?? '') })).not.toBeNull();
    expect(buildFenceMap({ source, position: pre?.position, code: String(pre?.props?.code ?? '') })).toBeNull();
  });

  it('行数が合わない（`code` が切り出しと食い違う）', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const pre = find(await parse(source), 'pre');

    expect(buildFenceMap({ source, position: pre?.position, code: 'const a = 1;\nconst b = 2;\n' })).toBeNull();
  });

  it('行の中の桁が照合できない（`code` が切り出しの行と別物）', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const pre = find(await parse(source), 'pre');

    expect(buildFenceMap({ source, position: pre?.position, code: 'const b = 2;\n' })).toBeNull();
  });
});

describe('範囲の外は null', () => {
  it('表示・生テキストのどちらも、範囲の外と整数でない値を弾く', async () => {
    const source = `${PREFIX}\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const { map, code } = await requireMapOf(source);

    expect(map.toSourceRange(-1)).toBeNull();
    expect(map.toSourceRange(code.length + 1)).toBeNull();
    expect(map.toSourceRange(1.5)).toBeNull();
    expect(map.toDisplayRange(map.sourceRange.start - 1)).toBeNull();
    expect(map.toDisplayRange(map.sourceRange.end + 1)).toBeNull();
    expect(map.toDisplayRange(1.5)).toBeNull();
    // 端は受ける
    expect(map.toSourceRange(code.length)).not.toBeNull();
    expect(map.toDisplayRange(map.sourceRange.end)).not.toBeNull();
  });
});

describe('往復して元に戻る', () => {
  const cases = [
    '```ts\nconst a = 1;\n```\n',
    '```\nplain\n```\n',
    '```ts\n\ta\n\t\tb\n```\n',
    '```ts\na\tb\tc\nab\tc\nabcd\te\n```\n',
    '```ts\n// 日本語\nconst a = "𠮷野家🎉";\n```\n',
    '```ts\na\n\n\nb\n```\n',
    '```ts\nconst a = 1;   \n```\n',
    '~~~ts\nconst a = 1;\n~~~\n',
    '````ts\n```\nnested\n```\n````\n',
    '- 項目\n\n  ```ts\n  a\n  \tb\n  ```\n',
    '> ```ts\n> a\n>\n> \tb\n> ```\n',
    '```ts\nconst a = 1;\n```',
    '```ts\nconst a = 1;\n',
  ];

  for (const body of cases) {
    it(`表示 → 生 → 表示: ${JSON.stringify(body)}`, async () => {
      const source = PREFIX + body;
      const { map, code } = await requireMapOf(source);
      expectRoundTrip(source, code, map);
    });
  }
});
