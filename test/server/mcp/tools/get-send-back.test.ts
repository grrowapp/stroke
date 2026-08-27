import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: getSendBackTool } = await import('../../../../server/mcp/tools/get-send-back');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as { $fetch: ReturnType<typeof vi.fn> };
const getSendBackHandler = (headers: Record<string, string>) => structuredResult(getSendBackTool.handler({}, withHeaders(headers)));

describe('get-send-back', () => {
  beforeEach(() => {
    $fetch.mockClear();
  });

  it('A4 が 200 を返せば status:200 と指摘一式を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    const payload = { response: '要約', comments: [], annotations: '{}', nextSteps: ['直す'] };
    $fetch.mockResolvedValueOnce(payload);

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, ...payload });
    removeConnection(token);
  });

  it('差し戻しがまだ無いと no_send_back として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(404, { message: '差し戻しはまだ無い。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'no_send_back', error: '差し戻しはまだ無い。' });
    removeConnection(token);
  });

  it('セッションが無いと同じ404でも session_not_found として区別する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'session_not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('破損データで 500 が返っても no_send_back に誤ラベルしない', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.mockRejectedValueOnce(fetchErrorWith(500, { message: 'state.json が壊れている。' }));

    const result = await getSendBackHandler({ 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: 'state.json が壊れている。' });
    removeConnection(token);
  });

  it('token が無効なら拒否され、A4 を叩かない', async () => {
    await expect(getSendBackHandler({ 'x-stroke-token': 'never-issued' })).rejects.toThrow();
    expect($fetch).not.toHaveBeenCalled();
  });
});
