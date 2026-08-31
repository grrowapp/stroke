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
const REQUIRED: Array<[string, RegExp[]]> = [
  ['状態を確認', [/get-overview/, /get-strokes/, /get-send-back/]],
  ['問いを立てる', [/一度に1問/, /send-question/, /上限/]],
  ['把握完了', [/問うのをやめて|proposal へ移る/]],
  ['proposal を提出', [/submit-document/, /type: "flontier"/, /projectName/]],
  ['差し戻しを受けたら', [/get-send-back/, /全文/]],
  ['うまくいかないとき', [/errorCode/, /status/, /session_not_found/, /unauthorized/]],
  ['やらないこと', [/openspec/]],
];
/**
 * 手順が**節として**書かれていることを見る。
 *
 * 手掛かり語だけを見ていると、本文をキーワードの羅列に置き換えてもテストが通る
 * （変異試験で確認。santa-method レビュー指摘 9周目 2026-08-31）。このツールの唯一の
 * 成果物は本文なので、「実装を消しても通る」がそのまま当てはまってしまう。
 *
 * 節ごとに見出しがあり、その下に中身が続いていることまで見る。
 */
function sectionBodies(guide: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const parts = guide.split(/^## /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
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
    // **節をまたいだ部分一致では見ない。** 文書のどこかに語が在ればよい形にすると、
    // 見出しを残したままキーワードの羅列に置き換えても通ってしまう（変異試験で実証。
    // santa-method レビュー指摘 10周目 2026-08-31）。節ごとに、その節に要る語が
    // **その節の中に**在ることと、文として書かれている（句点が2つ以上）ことを見る。
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };
    const bodies = sectionBodies(guide);
    const headings = [...bodies.keys()];

    for (const [section, patterns] of REQUIRED) {
      const found = headings.find(h => h.includes(section));
      expect(found, `節「${section}」が無い`).toBeDefined();
      const body = bodies.get(found!) ?? '';
      expect((body.match(/。/g) ?? []).length, `節「${section}」が文になっていない`).toBeGreaterThanOrEqual(1);
      for (const pattern of patterns) {
        expect(body, `節「${section}」に ${pattern} が無い`).toMatch(pattern);
      }
    }

    // 全体としても文で書かれている（節ごとの1つだけでは羅列を許してしまう）
    expect((guide.match(/。/g) ?? []).length).toBeGreaterThanOrEqual(20);

    // 節の並びが入れ替わっていない
    const order = REQUIRED.map(([section]) => headings.findIndex(h => h.includes(section)));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    removeConnection(token);
  });
});
