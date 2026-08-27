import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getStrokesTool } = await import('../../../../server/mcp/tools/get-strokes');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as { $fetch: ReturnType<typeof vi.fn> };
const getStrokesHandler = (headers: Record<string, string>) => structuredResult(getStrokesTool.handler({}, withHeaders(headers)));

describe('get-strokes', () => {
  beforeEach(() => {
    $fetch.mockClear();
  });

  it('U3 が 200 を返せば status:200 と時系列の記録一覧を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    const strokes = [{ proposal: false, question: { header: 'h', detail: 'd', question: 'q', options: [] }, answer: { kind: 'free', value: 'a' } }];
    $fetch.mockResolvedValueOnce({ strokes });

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, strokes });
    removeConnection(token);
  });

  it('セッションが無いと 404 を返し、not_found として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('破損データで 500 が返っても not_found に誤ラベルしない', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(500, { message: 'strokes.json が壊れている。' }));

    const result = await getStrokesHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: 'strokes.json が壊れている。' });
    removeConnection(token);
  });

  it('token が無効なら拒否され、U3 を叩かない', async () => {
    await expect(getStrokesHandler({ 'x-stroke-token': 'never-issued' })).rejects.toThrow();
    expect($fetch).not.toHaveBeenCalled();
  });
});
