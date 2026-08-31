import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../server/utils/control/upstream-proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/control/upstream-proxy')>();
  return { ...actual, upstreamClient: vi.fn() };
});

const { resolveProjectId } = await import('../../../../server/utils/mcp/resolve-project-id');
const { upstreamClient } = await import('../../../../server/utils/control/upstream-proxy');

const upstreamClientMock = vi.mocked(upstreamClient);

function fakeUpstreamClient(listProjects: ReturnType<typeof vi.fn>): ReturnType<typeof upstreamClient> {
  return { listProjects } as unknown as ReturnType<typeof upstreamClient>;
}

describe('resolveProjectId', () => {
  beforeEach(() => {
    upstreamClientMock.mockReset();
  });

  it('projectPath が一致するプロジェクトの projectId を返す', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'example', projectPath: '/opt/projects/example', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/example');

    expect(result).toEqual({ ok: true, projectId: 'PID1' });
  });

  it('末尾スラッシュの有無で取り違えない（比較は正規化してから）', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'example', projectPath: '/opt/projects/example', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/example/');

    expect(result).toEqual({ ok: true, projectId: 'PID1' });
  });

  it('`..` や `.` を含む書き方でも引き当てる', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'example', projectPath: '/opt/projects/example', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/other/../example/.');

    expect(result).toEqual({ ok: true, projectId: 'PID1' });
  });

  it('本家の一覧側が末尾スラッシュ付きでも引き当てる（正規化は両側に効く）', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'example', projectPath: '/opt/projects/example/', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/example');

    expect(result).toEqual({ ok: true, projectId: 'PID1' });
  });

  it('正規化しても別物なら一致させない', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'example', projectPath: '/opt/projects/example', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/example-2');

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('一覧は取れたが対象が無ければ、本家由来の失敗と区別して 404 project_not_registered を返す', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'other', projectPath: '/opt/projects/other', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/unknown');

    expect(result).toEqual({
      ok: false,
      status: 404,
      errorCode: 'project_not_registered',
      error: '対象のプロジェクトが本家の一覧に無い。',
    });
  });

  it('本家が 500 を返したら、到達不能に潰さず実ステータスを返す', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: false,
      failure: {
        kind: 'error-response',
        path: '/api/projects/list',
        status: 500,
        reason: '[GET] "/api/projects/list": 500 Error',
        detail: 'Failed to list projects',
      },
    })));

    const result = await resolveProjectId('/opt/projects/example');

    expect(result).toEqual({
      ok: false,
      status: 500,
      errorCode: 'upstream_error',
      error: 'Failed to list projects',
    });
  });

  it('一覧の取得そのものに失敗すれば unreachable(502) を返す', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: false,
      failure: { kind: 'unreachable', path: '/api/projects/list', reason: 'ECONNREFUSED' },
    })));

    const result = await resolveProjectId('/opt/projects/example');

    expect(result).toEqual({
      ok: false,
      status: 502,
      errorCode: 'unreachable',
      error: '本家に繋がらない: ECONNREFUSED',
    });
  });
});
