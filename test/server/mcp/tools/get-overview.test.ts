import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getOverviewTool } = await import('../../../../server/mcp/tools/get-overview');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as { $fetch: ReturnType<typeof vi.fn> };
const getOverviewHandler = (headers: Record<string, string>) => structuredResult(getOverviewTool.handler({}, withHeaders(headers)));

describe('get-overview', () => {
  beforeEach(() => {
    $fetch.mockClear();
  });

  it('A1 が 200 を返せば status:200 と overview を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.mockResolvedValueOnce({ overview: '作りたいシステムの説明' });

    const result = await getOverviewHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, overview: '作りたいシステムの説明' });
    removeConnection(token);
  });

  it('セッションが無いと A1 は 404 を返し、not_found として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await getOverviewHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('404 以外（想定外の失敗）は not_found に誤ラベルしない', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(500, { message: '想定外の失敗。' }));

    const result = await getOverviewHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: '想定外の失敗。' });
    removeConnection(token);
  });

  it('token が無効なら 401 で拒否され、A1 を叩かない', async () => {
    await expect(getOverviewHandler({ 'x-stroke-token': 'never-issued' })).rejects.toThrow();
    expect($fetch).not.toHaveBeenCalled();
  });
});
