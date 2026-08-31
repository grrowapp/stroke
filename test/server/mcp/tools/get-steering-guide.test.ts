import { describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, structuredResult, withHeaders } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getSteeringGuideTool } = await import('../../../../server/mcp/tools/get-steering-guide');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');

const call = (headers: Record<string, string>) => structuredResult(getSteeringGuideTool.handler({}, withHeaders(headers)));

/** 手掛かり語で見る理由は `get-guide.test.ts` と同じ（specs `mcp/tools/steering-guide`）。 */
const REQUIRED_TOPICS: Array<[string, RegExp]> = [
  ['3文書と作る順序', /product → tech → structure/],
  ['取得と提出の順序', /get-steering[\s\S]*submit-document/],
  ['文書がまだ無いときの進め方', /exists: false/],
  ['既に在る文書を上書きしてよいかの判断', /exists: true[\s\S]*上書き/],
  ['1文書を終わりとみなす基準', /終わりとみなす基準/],
  ['本家 MCP の役割', /approvals/],
];

describe('get-steering-guide', () => {
  it('引数を1つも渡さない呼び出しを inputSchema が通す', () => {
    expect(acceptsEmptyArgs(getSteeringGuideTool.inputSchema)).toBe(true);
  });

  it('有効な token なら status:200 と手順の本文を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const result = await call({ 'x-stroke-token': token }) as { status: number, guide: string };

    expect(result.status).toBe(200);
    expect(result.guide.length).toBeGreaterThan(0);
    removeConnection(token);
  });

  it('接続表に無い token は 401 を平坦な結果として返す（例外にしない）', async () => {
    expect(await call({ 'x-stroke-token': 'never-issued' })).toEqual({
      status: 401,
      errorCode: 'unauthorized',
      error: '無効な token。',
    });
  });

  it('token ヘッダが無い呼び出しも 401 を平坦な結果として返す', async () => {
    expect(await call({})).toMatchObject({ status: 401, errorCode: 'unauthorized' });
  });

  it('プロジェクトパスを持たない接続でも手順は返る（状態に依存しない）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    expect(await call({ 'x-stroke-token': token })).toMatchObject({ status: 200 });
    removeConnection(token);
  });

  it.each(REQUIRED_TOPICS)('手順が「%s」に触れている', async (_topic, pattern) => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };

    expect(guide).toMatch(pattern);
    removeConnection(token);
  });

  it('説明が「先に呼べ」と述べている', () => {
    expect(getSteeringGuideTool.description).toMatch(/先に/);
  });
});
