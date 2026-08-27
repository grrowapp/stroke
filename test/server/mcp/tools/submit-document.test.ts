import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

vi.mock('#build/fetch.mjs', () => ({ $fetch: mockFetch() }));
vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

vi.mock('../../../../server/utils/mcp/resolve-project-id', () => ({
  resolveProjectId: vi.fn(),
}));

vi.mock('../../../../server/utils/mcp/upstream-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/mcp/upstream-fetch')>();
  return { ...actual, upstreamFetch: vi.fn() };
});

const { default: submitDocumentTool } = await import('../../../../server/mcp/tools/submit-document');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { resolveProjectId } = await import('../../../../server/utils/mcp/resolve-project-id');
const { upstreamFetch } = await import('../../../../server/utils/mcp/upstream-fetch');
const { $fetch } = await import('#build/fetch.mjs') as unknown as {
  $fetch: ReturnType<typeof vi.fn> & { raw: ReturnType<typeof vi.fn> },
};
const submitDocumentHandler = (args: unknown, headers: Record<string, string>) => structuredResult(submitDocumentTool.handler(args as never, withHeaders(headers)));

const resolveProjectIdMock = vi.mocked(resolveProjectId);
const upstreamFetchMock = vi.mocked(upstreamFetch);

describe('submit-document', () => {
  beforeEach(() => {
    $fetch.mockClear();
    $fetch.raw.mockClear();
    resolveProjectIdMock.mockReset();
    upstreamFetchMock.mockReset();
  });

  describe('type: flontier', () => {
    it('A7 の実際の応答ステータスをそのまま返す（現状は200）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockResolvedValueOnce({ status: 200 });

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 200 });
      expect($fetch.raw).toHaveBeenCalledWith(
        '/api/strokes/session-1/proposal',
        expect.objectContaining({ method: 'POST', body: { proposal: '# proposal' } }),
      );
      removeConnection(token);
    });

    it('承認済みセッションには 409 phase_conflict として整形する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-approved' });
      $fetch.raw.mockRejectedValueOnce(fetchErrorWith(409, { message: '承認済みのセッションには提出できない。' }));

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 409, errorCode: 'phase_conflict', error: '承認済みのセッションには提出できない。' });
      removeConnection(token);
    });

    it('本文が空なら 400 validation_error として整形する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: '本文が空。' }));

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: '本文が空。' });
      removeConnection(token);
    });

    it('セッションが無いと 404 session_not_found として整形する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-missing' });
      $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'そのセッションは無い。' }));

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 404, errorCode: 'session_not_found', error: 'そのセッションは無い。' });
      removeConnection(token);
    });

    it('想定外のステータスは unexpected_status として整形する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockRejectedValueOnce(fetchErrorWith(500, { message: '想定外の失敗。' }));

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 500, errorCode: 'unexpected_status', error: '想定外の失敗。' });
      removeConnection(token);
    });
  });

  describe('type: steering', () => {
    it('name が無いと本家へ発行せず 400 validation_error として拒否する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: '文書名（name）が無い。' });
      expect(resolveProjectIdMock).not.toHaveBeenCalled();
      expect(upstreamFetchMock).not.toHaveBeenCalled();
      removeConnection(token);
    });

    it('本家 PUT が成功すれば status:200 を返す', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockResolvedValue(undefined);

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 200 });
      expect(upstreamFetchMock).toHaveBeenCalledWith(
        '/api/projects/PID1/steering/product',
        { method: 'PUT', body: { content: '# product' } },
      );
      removeConnection(token);
    });

    it('本家が停止中なら unreachable(502) を返す', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: 'connect ECONNREFUSED' });
      removeConnection(token);
    });

    it('本家が到達できて失敗した場合（実500の書き込み失敗）は unreachable に潰さず実応答を保持する', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockRejectedValue(fetchErrorWith(500, { error: 'Failed to save steering document: disk full' }));

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({
        status: 500,
        errorCode: 'upstream_error',
        error: 'Failed to save steering document: disk full',
      });
      removeConnection(token);
    });
  });

  it('token が無効なら拒否され、代行先を叩かない', async () => {
    await expect(submitDocumentHandler(
      { type: 'flontier', document: '# proposal' },
      { 'x-stroke-token': 'never-issued' },
    )).rejects.toThrow();
    expect($fetch.raw).not.toHaveBeenCalled();
    expect(upstreamFetchMock).not.toHaveBeenCalled();
  });
});
