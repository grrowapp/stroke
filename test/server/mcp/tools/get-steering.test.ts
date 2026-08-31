import { beforeEach, describe, expect, it, vi } from 'vitest';

import { acceptsEmptyArgs, fetchErrorWith, withHeaders, structuredResult } from './support';
import { documentContentSchema } from '../../../../server/utils/upstream/schema';

vi.mock('@nuxtjs/mcp-toolkit/server', () => ({ defineMcpTool: (def: unknown) => def }));

vi.mock('../../../../server/utils/mcp/resolve-project-id', () => ({
  resolveProjectId: vi.fn(),
}));

vi.mock('../../../../server/utils/control/upstream-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/control/upstream-proxy')>();
  return { ...actual, upstreamClient: vi.fn() };
});

vi.mock('../../../../server/utils/mcp/upstream-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/mcp/upstream-fetch')>();
  return { ...actual, upstreamFetch: vi.fn() };
});

const { default: getSteeringTool } = await import('../../../../server/mcp/tools/get-steering');
const { issueConnectionToken, registerConnection, removeConnection } = await import('../../../../server/utils/mcp/connection-table');
const { resolveProjectId } = await import('../../../../server/utils/mcp/resolve-project-id');
const { upstreamClient } = await import('../../../../server/utils/control/upstream-proxy');
const { upstreamFetch } = await import('../../../../server/utils/mcp/upstream-fetch');
const getSteeringHandler = (args: { name?: string }, headers: Record<string, string>) => structuredResult(getSteeringTool.handler(args, withHeaders(headers)));

const resolveProjectIdMock = vi.mocked(resolveProjectId);
const upstreamClientMock = vi.mocked(upstreamClient);
const upstreamFetchMock = vi.mocked(upstreamFetch);

function fakeUpstreamClient(getProjectInfo: ReturnType<typeof vi.fn>): ReturnType<typeof upstreamClient> {
  return { getProjectInfo } as unknown as ReturnType<typeof upstreamClient>;
}

describe('get-steering', () => {
  beforeEach(() => {
    resolveProjectIdMock.mockReset();
    upstreamClientMock.mockReset();
    upstreamFetchMock.mockReset();
  });

  it('文書を読む: status:200・exists・本文を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ status: 200, data: { content: '# product' } });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: true,
      value: { steering: { documents: { product: true, tech: false, structure: false } } },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, exists: true, content: '# product' });
    // 形の検証つきで発行する（本家の 2xx でも形が違えば upstream_malformed になる経路）
    expect(upstreamFetchMock).toHaveBeenCalledWith('/api/projects/PID1/steering/product', documentContentSchema);
    removeConnection(token);
  });

  it('status は本家の実応答をそのまま載せる（定数を置かない）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ status: 203, data: { content: '# product' } });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: true,
      value: { steering: { documents: { product: true, tech: false, structure: false } } },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 203, exists: true, content: '# product' });
    removeConnection(token);
  });

  it('inputSchema は引数なしの呼び出しを通す（SDK の事前検証で弾かせない）', () => {
    // name を必須にすると SDK がハンドラより前に McpError(InvalidParams) を投げ、結果が
    // status も errorCode も持たなくなる（specs mcp/server の平坦形式の SHALL は無条件）。
    // 併せて下の「欠落」ケースが到達不能になる
    expect(acceptsEmptyArgs(getSteeringTool.inputSchema)).toBe(true);
  });

  // 欠落と、本家の `:name` ルートに届かない名前。後者は `encodeURIComponent` を通しても
  // 残り、URL の正規化でパスセグメントが消えるので、本家の検証（400）を受けられず素の
  // 404 になる。submit-document と同じ判定・同じ文言
  it.each([
    ['欠落', undefined],
    ['空文字', ''],
    ['カレントディレクトリ', '.'],
    ['親ディレクトリ', '..'],
  ])('本家のルートに届かない文書名（%s）は発行せず 400 validation_error として拒否する', async (_label, name) => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });

    const result = await getSteeringHandler(name === undefined ? {} : { name }, { 'x-stroke-token': token });

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
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn()));

    const result = await getSteeringHandler({ name: 'a/b' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid steering document name' });
    expect(upstreamFetchMock).toHaveBeenCalledWith('/api/projects/PID1/steering/a%2Fb', documentContentSchema);
    removeConnection(token);
  });

  it('flontier 接続から呼ばれても throw せず 400 connection_mismatch を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { sessionId: 'session-1' });

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({
      status: 400,
      errorCode: 'connection_mismatch',
      error: 'この接続は steering 工程向けではない。',
    });
    expect(resolveProjectIdMock).not.toHaveBeenCalled();
    expect(upstreamFetchMock).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('文書がまだ無い: exists:false と空の文章', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ status: 200, data: { content: '' } });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: true,
      value: { steering: { documents: { product: false, tech: false, structure: false } } },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'tech' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, exists: false, content: '' });
    removeConnection(token);
  });

  it('規定外の文書名は本家の 400 をそのまま validation_error として返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockRejectedValue(fetchErrorWith(400, { error: 'Invalid steering document name' }));
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn()));

    const result = await getSteeringHandler({ name: 'design' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 400, errorCode: 'validation_error', error: 'Invalid steering document name' });
    removeConnection(token);
  });

  it('本家の dashboard が停止していると unreachable(502) を返す', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn()));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    // 文言は `describeUpstreamFailure`（`/info` 側の経路）と同一。get-steering は1回の
    // 実行で両方を通りうるので、同じ原因の error を割らない
    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: '本家に繋がらない: connect ECONNREFUSED' });
    removeConnection(token);
  });

  it('projectId が引き当てられなければ resolveProjectId の失敗をそのまま返す（一覧に対象が無い場合）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/unknown' });
    resolveProjectIdMock.mockResolvedValue({
      ok: false,
      status: 404,
      errorCode: 'project_not_registered',
      error: '対象のプロジェクトが本家の一覧に無い。',
    });

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'project_not_registered', error: '対象のプロジェクトが本家の一覧に無い。' });
    expect(upstreamFetchMock).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('本家が到達できて応答した失敗（実404の Project not found）は unreachable に潰さず実応答を保持する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ status: 200, data: { content: '' } });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: false,
      failure: { kind: 'not-found', path: '/api/projects/PID1/info', detail: 'Project not found' },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: 'Project not found' });
    removeConnection(token);
  });

  it('info が本家の 500 で失敗しても unreachable に潰さない（文書取得側の 500 の扱いと揃える）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ status: 200, data: { content: '# product' } });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/PID1/info',
        status: 500,
        reason: '[GET] "/api/projects/PID1/info": 500 Error',
        detail: 'Failed to get project info',
      },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 500, errorCode: 'upstream_error', error: 'Failed to get project info' });
    removeConnection(token);
  });

  it('token が無効でも throw せず 401 unauthorized を返し、本家を叩かない', async () => {
    // throw すると status も errorCode も持たない isError テキストになり、結果の平坦形が
    // 崩れる（specs mcp/server は無条件）。HTTP 401 は middleware が担う
    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': 'never-issued' });

    expect(result).toEqual({ status: 401, errorCode: 'unauthorized', error: '無効な token。' });
    expect(upstreamFetchMock).not.toHaveBeenCalled();
  });
});
