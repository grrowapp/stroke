import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchErrorWith, withHeaders, structuredResult } from './support';

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
const getSteeringHandler = (args: { name: string }, headers: Record<string, string>) => structuredResult(getSteeringTool.handler(args, withHeaders(headers)));

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
    upstreamFetchMock.mockResolvedValue({ content: '# product' });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: true,
      value: { steering: { documents: { product: true, tech: false, structure: false } } },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 200, exists: true, content: '# product' });
    removeConnection(token);
  });

  it('文書がまだ無い: exists:false と空の文章', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ content: '' });
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

    expect(result).toEqual({ status: 502, errorCode: 'unreachable', error: 'connect ECONNREFUSED' });
    removeConnection(token);
  });

  it('projectId が引き当てられなければ resolveProjectId の失敗をそのまま返す（本家は到達できて「無い」と答えた場合）', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/unknown' });
    resolveProjectIdMock.mockResolvedValue({
      ok: false,
      status: 404,
      errorCode: 'upstream_error',
      error: '対象のプロジェクトが本家の一覧に無い。',
    });

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: '対象のプロジェクトが本家の一覧に無い。' });
    expect(upstreamFetchMock).not.toHaveBeenCalled();
    removeConnection(token);
  });

  it('本家が到達できて応答した失敗（実404の Project not found）は unreachable に潰さず実応答を保持する', async () => {
    const token = issueConnectionToken();
    registerConnection(token, { projectPath: '/opt/projects/example' });
    resolveProjectIdMock.mockResolvedValue({ ok: true, projectId: 'PID1' });
    upstreamFetchMock.mockResolvedValue({ content: '' });
    const getProjectInfo = vi.fn().mockResolvedValue({
      ok: false,
      failure: { kind: 'not-found', path: '/api/projects/PID1/info', detail: 'Project not found' },
    });
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(getProjectInfo));

    const result = await getSteeringHandler({ name: 'product' }, { 'x-stroke-token': token });

    expect(result).toEqual({ status: 404, errorCode: 'upstream_error', error: 'Project not found' });
    removeConnection(token);
  });

  it('token が無効なら拒否され、本家を叩かない', async () => {
    await expect(getSteeringHandler({ name: 'product' }, { 'x-stroke-token': 'never-issued' })).rejects.toThrow();
    expect(upstreamFetchMock).not.toHaveBeenCalled();
  });
});
