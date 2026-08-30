import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, mockFetch, fetchErrorWith, withHeaders, structuredResult } from './support';

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
    it('A7 の実際の応答ステータスをそのまま返す（受理は本文なしの204）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockResolvedValueOnce({ status: 204 });

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 204 });
      expect($fetch.raw).toHaveBeenCalledWith(
        '/api/strokes/session-1/proposal',
        expect.objectContaining({ method: 'POST', body: { proposal: '# proposal' } }),
      );
      removeConnection(token);
    });

    it('projectName を渡すと A7 の body に載せる（承認画面のプロジェクト名の候補）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockResolvedValueOnce({ status: 204 });

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal', projectName: 'my-project' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 204 });
      expect($fetch.raw).toHaveBeenCalledWith(
        '/api/strokes/session-1/proposal',
        expect.objectContaining({ body: { proposal: '# proposal', projectName: 'my-project' } }),
      );
      removeConnection(token);
    });

    it('projectName を省くと body に項目ごと載せない（A7 の既存の値を消さない）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockResolvedValueOnce({ status: 204 });

      await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      const body = $fetch.raw.mock.calls[0]?.[1]?.body as Record<string, unknown>;
      expect(body).toEqual({ proposal: '# proposal' });
      expect('projectName' in body).toBe(false);
      removeConnection(token);
    });

    it('steering 接続から type: flontier を投げても throw せず 400 connection_mismatch を返す', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({
        status: 400,
        errorCode: 'connection_mismatch',
        error: 'この接続は flontier 工程向けではない。',
      });
      expect($fetch.raw).not.toHaveBeenCalled();
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

    it('既知の文言でない 404 は session_not_found に寄せず unexpected_status とする', async () => {
      // ルート不一致などの見覚えのない 404 まで「そのセッションは無い」に畳むと、受け手は
      // 存在しない原因を直そうとする（specs mcp/server「契約に載せた状況へ無理に寄せては
      // ならない」MUST NOT）。get-overview / get-send-back と同じ守り
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });
      $fetch.raw.mockRejectedValueOnce(fetchErrorWith(404, { message: 'Cannot find any route matching.' }));

      const result = await submitDocumentHandler(
        { type: 'flontier', document: '# proposal' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 404, errorCode: 'unexpected_status', error: 'Cannot find any route matching.' });
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
    it('flontier 接続から type: steering を投げても throw せず 400 connection_mismatch を返す', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { sessionId: 'session-1' });

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({
        status: 400,
        errorCode: 'connection_mismatch',
        error: 'この接続は steering 工程向けではない。',
      });
      expect(resolveProjectIdMock).not.toHaveBeenCalled();
      expect(upstreamFetchMock).not.toHaveBeenCalled();
      removeConnection(token);
    });

    // 欠落と、本家の `:name` ルートに届かない名前。後者は `encodeURIComponent` を通しても
    // 残り、URL の正規化でパスセグメントが消えるので、本家の検証（400）を受けられず素の
    // 404 になる。get-steering と同じ判定・同じ文言
    it.each([
      ['欠落', undefined],
      ['空文字', ''],
      ['カレントディレクトリ', '.'],
      ['親ディレクトリ', '..'],
    ])('本家のルートに届かない文書名（%s）は発行せず 400 validation_error として拒否する', async (_label, name) => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', ...(name === undefined ? {} : { name }) },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({
        status: 400,
        errorCode: 'validation_error',
        error: '文書名（name）が無いか、使えない形（. / ..）。',
      });
      expect(resolveProjectIdMock).not.toHaveBeenCalled();
      expect(upstreamFetchMock).not.toHaveBeenCalled();
      removeConnection(token);
    });

    it('`/` を含む文書名は %2F になって届くので、本家に検証させる（手前で弾かない）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockRejectedValue(fetchErrorWith(400, { error: 'Invalid steering document name' }));

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'a/b' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid steering document name' });
      expect(upstreamFetchMock).toHaveBeenCalledWith(
        '/api/projects/PID1/steering/a%2Fb',
        expect.anything(),
        { method: 'PUT', body: { content: '# product' } },
      );
      removeConnection(token);
    });

    it('本家 PUT の実際の応答ステータスをそのまま返す', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockResolvedValue({ status: 200, data: { success: true } });

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 200 });
      expect(upstreamFetchMock).toHaveBeenCalledWith(
        '/api/projects/PID1/steering/product',
        expect.anything(),
        { method: 'PUT', body: { content: '# product' } },
      );
      removeConnection(token);
    });

    it('本家が 200 以外で応えたらその status を載せる（ここに定数を置かない）', async () => {
      const token = issueConnectionToken();
      registerConnection(token, { projectPath: '/opt/projects/example' });
      resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
      upstreamFetchMock.mockResolvedValue({ status: 201, data: { success: true } });

      const result = await submitDocumentHandler(
        { type: 'steering', document: '# product', name: 'product' },
        { 'x-stroke-token': token },
      );

      expect(result).toEqual({ status: 201 });
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

      // 文言は `describeUpstreamFailure` と同一（`upstream-fetch.ts` の
      // `classifySteeringFailure` の注記）
      expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: '本家に繋がらない: connect ECONNREFUSED' });
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

  it('inputSchema は引数なしの呼び出しを通す（SDK の事前検証で弾かせない）', () => {
    // type を必須（かつ enum）にすると、欠落も規定外の値も SDK がハンドラより前に
    // McpError(InvalidParams) を投げ、結果が status も errorCode も持たなくなる
    // （specs mcp/server の平坦形式の SHALL は無条件）
    expect(acceptsEmptyArgs(submitDocumentTool.inputSchema)).toBe(true);
  });

  // type は代行先そのものを選ぶ項目で、欠落・規定外の値では要求を組み立てられない。
  // 値の妥当性を問い合わせる先が無いのでツール側で判定する（name と同じ立ち位置）
  it.each([
    ['欠落', undefined],
    ['空文字', ''],
    ['規定外の値', 'design'],
  ])('振り分け先を決められない種別（%s）は発行せず 400 validation_error として拒否する', async (_label, type) => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const result = await submitDocumentHandler(
      { document: '# proposal', ...(type === undefined ? {} : { type }) },
      { 'x-stroke-token': token },
    );

    expect(result).toEqual({
      status: 400,
      errorCode: 'validation_error',
      error: '種別（type）が無いか、使えない値。flontier / steering のいずれか。',
    });
    expect($fetch.raw).not.toHaveBeenCalled();
    expect(upstreamFetchMock).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('document を省いても代行先へ渡し、代行先の 400 をそのまま載せる', async () => {
    // 中身の妥当性を判定するのは代行先（ADR-0014）。ツール側で止めると、送り手は何を
    // 直せばよいかを代行先の文言として受け取れない
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });
    $fetch.raw.mockRejectedValueOnce(fetchErrorWith(400, { message: '本文が空。' }));

    const result = await submitDocumentHandler({ type: 'flontier' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: '本文が空。' });
    expect($fetch.raw).toHaveBeenCalledWith(
      '/api/strokes/session-1/proposal',
      expect.objectContaining({ method: 'POST' }),
    );
    removeConnection(token);
  });

  it('token が無効でも throw せず 401 unauthorized を返し、代行先を叩かない', async () => {
    // throw すると status も errorCode も持たない isError テキストになり、結果の平坦形が
    // 崩れる（specs mcp/server は無条件）。HTTP 401 は middleware が担う
    const result = await submitDocumentHandler(
      { type: 'flontier', document: '# proposal' },
      { 'x-stroke-token': 'never-issued' },
    );

    expect(result).toEqual({ status: 401, errorCode: 'unauthorized', error: '無効な token。' });
    expect($fetch.raw).not.toHaveBeenCalled();
    expect(upstreamFetchMock).not.toHaveBeenCalled();
  });
});
