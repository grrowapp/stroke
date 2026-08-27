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

  it('一覧は取れたが対象が無ければ、到達不能とは区別して 404 upstream_error を返す', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'other', projectPath: '/opt/projects/other', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/unknown');

    expect(result).toEqual({
      ok: false,
      status: 404,
      errorCode: 'upstream_error',
      error: '対象のプロジェクトが本家の一覧に無い。',
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
