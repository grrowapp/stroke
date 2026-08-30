/**
 * フェンス（コードブロック）について、**生テキストと画面に出る文字列がどう食い違うか**を固定する。
 *
 * 整形された本文の上で選ばれた範囲を生テキストの位置へ戻す口（`#markdown/position`）を
 * 作るには、フェンスの中の文字位置を自力で対応させるほかない。散文と違って、
 * **フェンスの中の text ノードは position を持たない**からである（`modules/markdown/index.ts`）。
 *
 * 手掛かりは2つしかない。`pre` ノードの position（開きのフェンスから閉じのフェンスまで）と、
 * `pre` の `code` 属性（画面に出る文字列）である。この2つの差がそのまま、対応表を作るときに
 * 補正しなければならない量になる。だからここでは差を1つずつ実測の形で書き留める。
 *
 * **「タブ展開だけが差」ではない。** 器のインデント剥がし・引用記号の剥がし・末尾改行の付与、
 * そして「生テキストの先頭から始まる要素は position を丸ごと落とす」という穴がある。
 * どれも対応表の実装が踏む地雷なので、パーサを上げて挙動が変わったらここが落ちるようにしておく。
 *
 * 実測は @nuxtjs/mdc 0.23.1。
 */
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { describe, expect, it } from 'vitest';

/**
 * `modules/markdown/index.ts` の `installModule('@nuxtjs/mdc', …)` と同じ。
 * 片方だけ変えると、このテストは実物と違うものを測ることになる
 */
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

/** 木を掘って最初に見つかった tag のノードを返す */
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
 * **フェンスを文書の先頭に置いてはならない。** 先頭から始まる要素は position を落とす
 * （「生テキストの先頭から始まる要素」の節で固定している）。差そのものを測る場面では
 * その穴に落ちないよう、必ず何かを前に置く
 */
const PREFIX = 'まえ\n\n';

/** `pre` の position で生テキストを切り出す。position が無ければ落とす */
function sliceOf(source: string, pre: AstNode): string {
  const position = pre.position;
  if (!position) throw new Error('pre が position を持たない');
  return source.slice(position.start, position.end);
}

/** `PREFIX` を足して parse し、最初の `pre` と生テキストの切り出しを返す */
async function fence(body: string): Promise<{ pre: AstNode; slice: string; code: string }> {
  const source = PREFIX + body;
  const pre = find(await parse(source), 'pre');
  if (!pre) throw new Error('pre が無い');
  return { pre, slice: sliceOf(source, pre), code: String(pre.props?.code) };
}

/** 切り出した範囲から、開きの行と閉じの行を除いた内側の行 */
function innerLines(slice: string): string[] {
  return slice.split('\n').slice(1, -1);
}

/** `code` 属性の行。末尾に必ず足される改行の分を1つ落としてから割る */
function codeLines(code: string): string[] {
  return code === '' ? [] : code.replace(/\n$/, '').split('\n');
}

describe('pre の position が指す範囲', () => {
  it('開きのフェンスから閉じのフェンスまでを指す。前後の改行は含まない', async () => {
    const { slice } = await fence('```ts\nconst a = 1;\n```\n');

    expect(slice).toBe('```ts\nconst a = 1;\n```');
  });

  it('インデントされたフェンスでも、切り出しには器のインデントが残る', async () => {
    // リストの中のフェンス。開き行は ``` から始まるが、内側の行は生テキストのまま
    // （2スペース付き）で、閉じ行のインデントも残る。位置を数えるときの落とし穴になる
    const source = '- 項目\n\n  ```ts\n  const a = 1;\n  ```\n';
    const pre = find(await parse(source), 'pre')!;

    expect(sliceOf(source, pre)).toBe('```ts\n  const a = 1;\n  ```');
  });

  it('閉じのフェンスが無いときは、そこまでの範囲を指す', async () => {
    const { slice } = await fence('```ts\nconst a = 1;\n');

    expect(slice).toBe('```ts\nconst a = 1;\n');
  });
});

describe('位置が取れない条件', () => {
  it('生テキストの先頭から始まる要素は position を持たない', async () => {
    // 原因は compiler の `node.position?.start?.offset && …` という真偽判定にある。
    // オフセット 0 は偽なので、位置がまるごと undefined になる（`compiler.js`）。
    // **フェンスに限らない。** 先頭の見出しも段落も同じように落ちる。
    // 対応表は「先頭要素だけ位置が無い」を必ず扱わねばならない
    const head = await parse('```ts\nconst a = 1;\n```\n');
    expect(find(head, 'pre')?.position).toBeUndefined();

    const heading = await parse('# 見出し\n');
    expect(find(heading, 'h1')?.position).toBeUndefined();

    // 1文字でも前に何かあれば位置は乗る
    const { pre } = await fence('```ts\nconst a = 1;\n```\n');
    expect(pre.position).toEqual({ start: 4, end: 26 });
  });

  it('CRLF は parse の前に LF へ潰される。オフセットは LF に直した文字列を指す', async () => {
    // `parseMarkdown` が `md.replace(/\r\n/g, '\n')` してから解析する（`parser/index.js`）。
    // 生ファイルのオフセットとは、それまでに現れた CRLF の数だけずれる
    const source = 'まえ\r\n\r\n```ts\r\nconst a = 1;\r\n```\r\n';
    const pre = find(await parse(source), 'pre')!;

    expect(pre.position).toEqual({ start: 4, end: 26 });
    // CRLF のままの文字列に当てると、ずれて別の場所を指す
    expect(source.slice(4, 26)).not.toBe('```ts\nconst a = 1;\n```');
    // LF に直した文字列に当てると合う
    expect(source.replace(/\r\n/g, '\n').slice(4, 26)).toBe('```ts\nconst a = 1;\n```');
  });

  it('front matter は parse の前に取り除かれる。オフセットは取り除いた後の文字列を指す', async () => {
    // front matter の分（ここでは16文字）だけ、生ファイルの位置と食い違う
    const source = '---\ntitle: x\n---\n\n```ts\nconst a = 1;\n```\n';
    const pre = find(await parse(source), 'pre')!;

    expect(pre.position).toEqual({ start: 2, end: 24 });
    expect(source.slice(2, 24)).not.toBe('```ts\nconst a = 1;\n```');
    // front matter を落とした本文に当てれば合う
    expect(source.slice(16).slice(2, 24)).toBe('```ts\nconst a = 1;\n```');
  });

  it('フェンスの中の text ノードは位置を持たず、code 要素の位置は pre と同じ', async () => {
    // 散文なら text ノードの位置から文字を数えられるが、フェンスの中はそれができない。
    // 内側の `code` 要素はフェンス記号まで含む pre と同じ範囲を指すので、
    // 中身の始まりを知る手掛かりにもならない。これが対応表を自前で作る理由である
    const { pre } = await fence('```ts\nconst a = 1;\n```\n');
    const code = pre.children?.[0];
    const text = code?.children?.[0];

    expect(code?.tag).toBe('code');
    expect(code?.position).toEqual(pre.position);
    expect(text?.type).toBe('text');
    expect(text?.position).toBeUndefined();
  });

  it('散文の text ノードは位置を持ち、生テキストと文字列が一致する（対比）', async () => {
    const source = 'まえ\n\nいろは**太字**にほへと\n';
    const paragraph = (await parse(source)).children?.[1];
    const nodes = paragraph?.children ?? [];

    for (const node of nodes) {
      if (node.type !== 'text') continue;
      expect(source.slice(node.position!.start, node.position!.end)).toBe(node.value);
    }
    expect(nodes.map((n) => n.value ?? '').join('')).toBe('いろはにほへと');
  });
});

describe('code 属性と生テキストの差', () => {
  it('差が出ない場合: 内側を切り出したものと code がそのまま一致する', async () => {
    const cases = [
      '```ts\nconst a = 1;\n```\n', // 言語指定あり
      '```\nplain\n```\n', // 言語指定なし
      '```ts\n  const a = 1;\n```\n', // 行頭2スペース
      '```ts\n    const a = 1;\n```\n', // 行頭4スペース
      '```ts\nconst a = 1;\n\n\n```\n', // 末尾に空行
      '```ts\na\n\nb\n```\n', // 途中に空行
      '```ts\nconst a = 1;   \n```\n', // 行末に空白
      '```ts\n// 日本語のコメント\nconst あ = 1;\n```\n', // 日本語
      '```ts\nconst a = "𠮷野家🎉";\n```\n', // サロゲートペア
      '~~~ts\nconst a = 1;\n~~~\n', // チルダのフェンス
      '````ts\n```\nnested\n```\n````\n', // 入れ子（4個のフェンス）
    ];

    for (const source of cases) {
      const { slice, code } = await fence(source);
      expect(innerLines(slice).map((line) => `${line}\n`).join(''), source).toBe(code);
    }
  });

  it('タブは「4桁のタブ位置まで」の空白に開く。4つの空白への置換ではない', async () => {
    // `detab` は桁を見て詰める。行頭のタブは4文字、2文字目のタブは2文字にしかならない。
    // **タブ1つあたりの増分が一定でない**ので、行の中の位置を知らずに補正できない
    expect((await fence('```\na\tb\n```\n')).code).toBe('a   b\n'); // 1桁目の後 → 空白3
    expect((await fence('```\nab\tc\n```\n')).code).toBe('ab  c\n'); // 2桁目の後 → 空白2
    expect((await fence('```\nabcd\te\n```\n')).code).toBe('abcd    e\n'); // ちょうど桁 → 空白4
    expect((await fence('```\n\tx\n```\n')).code).toBe('    x\n'); // 行頭 → 空白4

    // 生テキストは当然タブのまま。文字数が食い違う
    const { slice, code } = await fence('```ts\n\tconst a = 1;\n\t\tconst b = 2;\n```\n');
    expect(innerLines(slice)).toEqual(['\tconst a = 1;', '\t\tconst b = 2;']);
    expect(code).toBe('    const a = 1;\n        const b = 2;\n');
  });

  it('インデントされたフェンスでは、器のインデントが各行から落ちる', async () => {
    const source = '- 項目\n\n  ```ts\n  const a = 1;\n  ```\n';
    const pre = find(await parse(source), 'pre')!;

    // 生テキストは2スペース付き、code は落ちている
    expect(innerLines(sliceOf(source, pre))).toEqual(['  const a = 1;']);
    expect(pre.props?.code).toBe('const a = 1;\n');
  });

  it('インデントを落としてからタブを開くので、生テキストの桁とは合わない', async () => {
    // 生テキストでは `  \t` （2スペース＋タブ）で、タブは4桁目まで＝空白2つに相当する。
    // しかし器の2スペースを先に落とすため、タブは0桁目から開かれて空白4つになる。
    // **タブの数だけ数えても復元できない**ことがここに出る
    const source = '- 項目\n\n  ```ts\n  \tconst a = 1;\n  ```\n';
    const pre = find(await parse(source), 'pre')!;

    expect(innerLines(sliceOf(source, pre))).toEqual(['  \tconst a = 1;']);
    expect(pre.props?.code).toBe('    const a = 1;\n');
  });

  it('引用の中のフェンスでは `> ` が落ちる', async () => {
    const source = 'まえ\n\n> ```ts\n> const a = 1;\n> ```\n';
    const pre = find(await parse(source), 'pre')!;

    expect(innerLines(sliceOf(source, pre))).toEqual(['> const a = 1;']);
    expect(pre.props?.code).toBe('const a = 1;\n');
  });

  it('最後の行に改行が無くても code には必ず足される', async () => {
    // `detab(node.value + '\n')`（`handlers/code.js`）。生テキストに無い1文字が増える
    const { slice, code } = await fence('```ts\nconst a = 1;\n```');

    expect(slice).toBe('```ts\nconst a = 1;\n```');
    expect(code).toBe('const a = 1;\n');
  });

  it('空のフェンスの code は空文字。改行も足されない', async () => {
    expect((await fence('```ts\n```\n')).code).toBe('');
    expect((await fence('```\n```\n')).code).toBe('');
    // 開いただけで閉じていない場合も同じ
    expect((await fence('```ts\n')).code).toBe('');
  });

  it('情報行のメタは code に入らない。属性へ分かれる', async () => {
    // 開き行の長さが変わっても中身は変わらない。逆に言えば、code の先頭が生テキストの
    // どこに当たるかは開き行を数えないと出せない
    const title = await fence('```ts title="x"\nconst a = 1;\n```\n');
    expect(title.code).toBe('const a = 1;\n');
    expect(title.pre.props).toMatchObject({ language: 'ts', meta: 'title="x"' });

    const filename = await fence('```ts [foo.ts]\nconst a = 1;\n```\n');
    expect(filename.code).toBe('const a = 1;\n');
    expect(filename.pre.props).toMatchObject({ language: 'ts', filename: 'foo.ts' });

    const highlights = await fence('```ts {1,3}\na\nb\nc\n```\n');
    expect(highlights.code).toBe('a\nb\nc\n');
    expect(highlights.pre.props).toMatchObject({ language: 'ts', highlights: [1, 3] });
  });

  it('オフセットは UTF-16 の単位。サロゲートペアは2つと数える', async () => {
    // 対応表を「コードポイントの数」で作ると、絵文字や異体字を含む文書でずれる
    const source = '𠮷🎉\n\n```ts\na\n```\n';
    const pre = find(await parse(source), 'pre')!;

    expect(pre.position!.start).toBe(source.indexOf('```')); // = 6（UTF-16）
    expect([...source.slice(0, source.indexOf('```'))].length).toBe(4); // コードポイントなら4
    expect(sliceOf(source, pre)).toBe('```ts\na\n```');
  });
});

describe('行の並びは保たれる', () => {
  it('フェンスの内側の行数と code の行数は一致する', async () => {
    // **後続の「行ごとに対応表を作る」設計の前提。** 行が増えたり減ったり入れ替わったり
    // しないので、内側の n 行目と code の n 行目を突き合わせられる。
    // 食い違うのは行の中の桁だけ（タブ展開・インデント剥がし）である
    const cases = [
      '```ts\na\nb\nc\n```\n',
      '```\n\ta\n\tb\n```\n',
      '```ts\n\n\n```\n',
      '```ts\na\n\n\n```\n',
      '```ts\n```\n',
      '```ts\n', // 閉じ無し
      '- 項目\n\n  ```ts\n  a\n  b\n  ```\n',
      '> ```ts\n> a\n> b\n> ```\n',
    ];

    for (const source of cases) {
      const pre = find(await parse(PREFIX + source), 'pre')!;
      const slice = sliceOf(PREFIX + source, pre);
      expect(innerLines(slice).length, source).toBe(codeLines(String(pre.props?.code)).length);
    }
  });

  it('4スペースのインデントコードブロックだけは行の対応が崩れる', async () => {
    // フェンスの行が無いので position は中身だけを指す。「先頭と末尾の行を落とす」
    // という数え方が通らず、しかもインデントが落ちて桁もずれる。
    // **フェンス記法かどうかを見分けてから対応表を作る必要がある**
    const source = 'まえ\n\n    const a = 1;\n    const b = 2;\n';
    const pre = find(await parse(source), 'pre')!;
    const slice = sliceOf(source, pre);

    expect(slice).toBe('    const a = 1;\n    const b = 2;');
    expect(pre.props?.code).toBe('const a = 1;\nconst b = 2;\n');
    // 内側を数える規則が当てはまらない（2行あるのに0行と数えてしまう）
    expect(innerLines(slice)).toEqual([]);
    expect(codeLines(String(pre.props?.code))).toHaveLength(2);
    // 言語の指定を持てないので `language` は 'text' になる。フェンスと見分ける手掛かり
    expect(pre.props?.language).toBe('text');
  });
});
