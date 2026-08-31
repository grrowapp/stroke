import { describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, structuredResult, withHeaders } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getSteeringGuideTool } = await import('../../../../server/mcp/tools/get-steering-guide');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');

const call = (headers: Record<string, string>) => structuredResult(getSteeringGuideTool.handler({}, withHeaders(headers)));

/** 節ごとに、その節へ入っていなければならない内容（`get-guide.test.ts` と同じ考え）。 */
const REQUIRED: Array<[string, RegExp[]]> = [
  ['状況を確認', [/get-steering/, /exists: false/, /exists: true/, /上書き/]],
  ['書く順序', [/product → tech → structure/, /1本ずつ/]],
  ['提出する', [/submit-document/, /type: "steering"/, /product/]],
  ['終わりとみなす基準', [/書き終わり|終わりである/]],
  ['うまくいかないとき', [
    /errorCode/, /project_not_registered/, /unreachable/,
    /upstream_error/, /upstream_malformed/, /connection_mismatch/,
    /直接書いて/,
  ]],
  ['どこで工程が終わるか', [/3本/]],
  ['本家 MCP は使わない', [/approvals/, /呼ばない/]],
  ['やらないこと', [/直接読み書き/]],
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

  it('説明が「先に呼べ」と述べている', () => {
    expect(getSteeringGuideTool.description).toMatch(/先に/);
  });

  it('手順が節ごとに書かれ、それぞれの節に要る内容が入っている', async () => {
    // **節をまたいだ部分一致では見ない。** 文書のどこかに語が在ればよい形にすると、
    // 見出しを残したままキーワードの羅列に置き換えても通ってしまう（変異試験で実証。
    // santa-method レビュー指摘 10周目 2026-08-31）。節ごとに、その節に要る語が
    // **その節の中に**在ることと、中身が続いていること（長さと句点）を見る。
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/setai' });

    const { guide } = await call({ 'x-stroke-token': token }) as { guide: string };
    const bodies = sectionBodies(guide);
    const headings = [...bodies.keys()];

    for (const [section, patterns] of REQUIRED) {
      const found = headings.find(h => h.includes(section));
      expect(found, `節「${section}」が無い`).toBeDefined();
      const body = bodies.get(found!) ?? '';
      expect(body.length, `節「${section}」の中身が薄い`).toBeGreaterThan(40);
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
