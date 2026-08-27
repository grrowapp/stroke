import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

const { default: sendQuestionTool } = await import('../../../../server/mcp/tools/send-question');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { $fetch } = await import('#build/fetch.mjs') as unknown as {
  $fetch: ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> },
};
const sendQuestionHandler = (args: unknown, headers: Record<string, string>) => structuredResult(sendQuestionTool.handler(args as never, withHeaders(headers)));

const QUESTION = { header: 'h', detail: 'd', question: 'q', options: [] };

describe('send-question', () => {
  beforeEach(() => {
    $fetch.mockClear();
    $fetch.raw.mockClear();
  });

  it('A5 の実際の応答ステータスをそのまま返す（現状は200。api-contract.md の204とは食い違う）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockResolvedValueOnce({ status: 200 });

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 200 });
    expect($fetch.raw).toHaveBeenCalledWith(
      '/api/strokes/session-1/question',
      expect.objectContaining({ method: 'POST', body: QUESTION }),
    );
    removeConnection(token);
  });

  it('送信先の検証に通らないと 400 validation_error として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: '問いの構造として読み取れない。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: '問いの構造として読み取れない。' });
    removeConnection(token);
  });

  it('セッションが無いと 404 session_not_found として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-missing' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'session_not_found', error: 'そのセッションは無い。' });
    removeConnection(token);
  });

  it('承認済みセッションには 409 phase_conflict として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-approved' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(409, { message: '承認済みのセッションには提出できない。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 409, errorCode: 'phase_conflict', error: '承認済みのセッションには提出できない。' });
    removeConnection(token);
  });

  it('想定外のステータスは unexpected_status として整形する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(500, { message: '想定外の失敗。' }));

    const result = await sendQuestionHandler(QUESTION, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: '想定外の失敗。' });
    removeConnection(token);
  });

  it('token が無効なら拒否され、A5 を叩かない', async () => {
    await expect(sendQuestionHandler(QUESTION, { 'x-stroke-token': 'never-issued' })).rejects.toThrow();
    expect($fetch.raw).not.toHaveBeenCalled();
  });
});
