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

  it('手順が節として書かれている（キーワードの羅列では通らない）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };
    const bodies = sectionBodies(guide);

    // 見出しが順に在り、それぞれに中身が続いている
    const headings = [...bodies.keys()];
    for (const required of ['状況を確認', '書く順序', '提出する', '終わりとみなす基準', 'うまくいかないとき', 'どこで工程が終わるか', 'やらないこと']) {
      const found = headings.find(h => h.includes(required));
      expect(found, `節「${required}」が無い`).toBeDefined();
      expect((bodies.get(found!) ?? '').length, `節「${required}」の中身が薄い`).toBeGreaterThan(40);
    }
    // 節の並びが入れ替わっていない
    const order = ['状況を確認', '書く順序', '提出する', '終わりとみなす基準', 'うまくいかないとき', 'どこで工程が終わるか', 'やらないこと'].map(r => headings.findIndex(h => h.includes(r)));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    removeConnection(token);
  });
});
