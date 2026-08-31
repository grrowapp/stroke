import { describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, structuredResult, withHeaders } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getGuideTool } = await import('../../../../server/mcp/tools/get-guide');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');

const call = (headers: Record<string, string>) => structuredResult(getGuideTool.handler({}, withHeaders(headers)));

/**
 * 手順の本文が spec の5項目を含むかは、**手掛かり語**で見る。本文の丸ごと一致で見ると
 * 言い回しを直すたびにテストが落ち、直すのはテストの期待値のほうになる——それでは
 * 何も守っていない（specs `mcp/tools/guide` の Requirement「手順は工程の全体と終わり方を
 * 含む」に対応する）。
 */
const REQUIRED_TOPICS: Array<[string, RegExp]> = [
  ['状態の確認から提出までの順序', /get-overview[\s\S]*get-strokes[\s\S]*get-send-back[\s\S]*submit-document/],
  ['問いを立てる単位（一度に1問）', /一度に1問/],
  ['上限の在りか（数値は書き写さない）', /上限は `send-question` の引数の\s*\n?\s*説明に書いてある|上限は `send-question`/],
  ['把握完了の判定', /把握完了/],
  ['proposal を提出する条件と形式', /submit-document[\s\S]*type: "flontier"/],
  ['差し戻しを受けたときの進め方', /差し戻し/],
  ['openspec コマンドへ逸れさせない', /`openspec` コマンドを叩かない/],
];

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

  it.each(REQUIRED_TOPICS)('手順が「%s」に触れている', async (_topic, pattern) => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };

    expect(guide).toMatch(pattern);
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
});
