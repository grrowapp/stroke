import { describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, structuredResult, withHeaders } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getGuideTool } = await import('../../../../server/mcp/tools/get-guide');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');

const call = (headers: Record<string, string>) => structuredResult(getGuideTool.handler({}, withHeaders(headers)));

/**
 * 節ごとに、その節へ入っていなければならない内容。
 *
 * 正の在りかを繰り返さない——上限の数値は `send-question` の `.describe()` が正なので、
 * ここでは「どこに書いてあるか」を指していることだけを見る。
 */
const REQUIRED: Array<[string, RegExp[], number]> = [
  // 語が在るだけでは見ない。旧テストが見ていた具体性（読む順序・在りかを指すこと・
  // 禁止の言い切り）を落とすと、その部分を骨抜きにしても通る（santa-method 11周目）
  ['状態を確認', [/get-overview[\s\S]*get-strokes[\s\S]*get-send-back/], 120],
  ['問いを立てる', [/一度に1問/, /send-question/, /上限は `send-question` の引数の/], 230],
  ['把握完了', [/問うのをやめて|proposal へ移る/], 110],
  ['proposal を提出', [/submit-document/, /type: "flontier"/, /projectName/], 210],
  ['差し戻しを受けたら', [/get-send-back/, /全文/], 100],
  ['うまくいかないとき', [
    /errorCode/, /status/,
    /session_not_found/, /unauthorized/, /phase_conflict/, /connection_mismatch/,
    /no_send_back/, /validation_error/,
  ], 470],
  ['やらないこと', [/`openspec` コマンドを叩かない/], 130],
];
/**
 * 手順が**節として**書かれていることを見る。
 *
 * このテストが見るのは4つだけである。
 *
 * 1. 決めた節が在ること
 * 2. 節の並びが入れ替わっていないこと
 * 3. その節に要る語が**その節の中に**在ること（節をまたいだ部分一致では見ない）
 * 4. 節が痩せていないこと（節ごとの最低の長さ）
 *
 * **見ないもの: 意味である。** 部分文字列の一致でしかないので、「叩かない」を
 * 「叩かない、という決まりは無い」に書き換えるような**規範の反転は通り抜ける**
 * （変異試験で確認。santa-method レビュー指摘 12周目 2026-08-31）。これは正規表現を
 * 足しても塞げない種類の穴なので、塞げるふりをしない。
 *
 * 手順が**指示として正しいか**は、実機で1周させてエージェントがそのとおりに動くかで見る
 * （各 change の検証の章）。ここで見ているのは、節ごと消えたり中身が抜けたりしていないこと
 * ——**書き換えの事故**であって、悪意ある書き換えではない。
 */
function sectionBodies(guide: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const parts = guide.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\\n');
    bodies.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return bodies;
}

describe('get-guide', () => {
  it('引数を1つも渡さない呼び出しを inputSchema が通す', () => {
    // SDK は inputSchema をハンドラより前に検証する（support.ts の acceptsEmptyArgs）
    expect(acceptsEmptyArgs(getGuideTool.inputSchema)).toBe(true);
  });

  it('有効な token なら status:200 と手順の本文を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const result = await call({ 'x-stroke-token': token }) as { status: number, guide: string };

    expect(result.status).toBe(200);
    expect(result.guide.length).toBeGreaterThan(0);
    removeConnection(token);
  });

  it('接続表に無い token は 401 を平坦な結果として返す（例外にしない）', async () => {
    // throw するとモジュールが isError のテキストへ畳み、status を持たない結果になる
    // （specs `mcp/server` の平坦形式の SHALL）
    const result = await call({ 'x-stroke-token': 'never-issued' });

    expect(result).toEqual({
      status: 401,
      errorCode: 'unauthorized',
      error: '無効な token。',
    });
  });

  it('token ヘッダが無い呼び出しも 401 を平坦な結果として返す', async () => {
    expect(await call({})).toMatchObject({ status: 401, errorCode: 'unauthorized' });
  });

  it('セッション id を持たない接続でも手順は返る（状態に依存しない）', async () => {
    // steering 側の接続文脈（projectPath だけ）で呼ばれても落ちないこと。手順は
    // 状態に依存しない（specs `mcp/tools/guide`）ので、接続の中身を見ない
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    expect(await call({ 'x-stroke-token': token })).toMatchObject({ status: 200 });
    removeConnection(token);
  });

  it('上限の数値そのものは本文に書き写さない', async () => {
    // 正は send-question の inputSchema の `.describe()`。書き写すと2箇所になり、
    // 片方だけが古くなる（design.md の Risks）
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };

    // 正の表記は `.describe()` の「12文字以内」なので、**その表記で捕まえる**。
    // 「字」だけを見ていると、書き写しの最も起こりやすい形をすり抜ける
    expect(guide).not.toMatch(/12\s*(字|文字)|300\s*(字|文字)|20\s*(字|文字)|50\s*(字|文字)/);
    // 上限は長さだけではない。件数（「1件以上5件以内」）も同じく `.describe()` が正である
    expect(guide).not.toMatch(/\d\s*件(以上|以内|まで)/);
    removeConnection(token);
  });

  it('説明が「先に呼べ」と述べている', () => {
    // specs `mcp/tools/guide` の Requirement「最初に読ませる」
    expect(getGuideTool.description).toMatch(/先に/);
  });

  it('手順が節ごとに書かれ、それぞれの節に要る内容が入っている', async () => {
    // 何を見て何を見ないかは `sectionBodies` の説明にある
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };
    const bodies = sectionBodies(guide);
    const headings = [...bodies.keys()];

    for (const [section, patterns, minLength] of REQUIRED) {
      const found = headings.find(h => h.includes(section));
      expect(found, `節「${section}」が無い`).toBeDefined();
      const body = bodies.get(found!) ?? '';
      // 最低の長さは実際の分量の6割ほど。**書き足すのは自由で、抜くと落ちる**
      expect(body.length, `節「${section}」の中身が抜けている`).toBeGreaterThanOrEqual(minLength);
      for (const pattern of patterns) {
        expect(body, `節「${section}」に ${pattern} が無い`).toMatch(pattern);
      }
    }

    // 節の並びが入れ替わっていない
    const order = REQUIRED.map(([section]) => headings.findIndex(h => h.includes(section)));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    removeConnection(token);
  });
});
