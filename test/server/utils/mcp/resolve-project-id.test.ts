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
      value: [{ projectId: 'PID1', projectName: 'alpha-proj', projectPath: '/opt/projects/other', instances: [] }],
    })));

    const result = await resolveProjectId('/opt/projects/unknown');

    expect(result).toMatchObject({ ok: false, status: 404, errorCode: 'project_not_registered' });
  });

  it('一覧にプロジェクトはあるが対応しないときの error に、要求パスと一覧の全プロジェクトの名前・パスが含まれる', async () => {
    // 名前はパスの部分文字列にしない。`alpha-proj` が `/opt/projects/other` に含まれないので、
    // 名前を落とすと落ちる（delta `mcp/server`「名前とパスを含む SHALL」）。
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { projectId: 'PID1', projectName: 'alpha-proj', projectPath: '/opt/projects/other', instances: [] },
        { projectId: 'PID2', projectName: 'beta-proj', projectPath: '/opt/projects/second', instances: [] },
      ],
    })));

    const result = await resolveProjectId('/opt/projects/unknown');

    expect(result.ok).toBe(false);
    const error = (result as { error: string }).error;
    expect(error).toContain('/opt/projects/unknown');
    expect(error).toContain('alpha-proj');
    expect(error).toContain('/opt/projects/other');
    expect(error).toContain('beta-proj');
    expect(error).toContain('/opt/projects/second');
  });

  it('一覧に複数のエントリがあっても、一致する1件を引き当てる', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { projectId: 'PID1', projectName: 'alpha-proj', projectPath: '/opt/projects/other', instances: [] },
        { projectId: 'PID2', projectName: 'beta-proj', projectPath: '/opt/projects/example', instances: [] },
        { projectId: 'PID3', projectName: 'gamma-proj', projectPath: '/opt/projects/second', instances: [] },
      ],
    })));

    const result = await resolveProjectId('/opt/projects/example');

    expect(result).toEqual({ ok: true, projectId: 'PID2' });
  });

  it('一覧が空のときの error は、一覧にプロジェクトがあって外れたときの本文と区別できる', async () => {
    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [],
    })));

    const emptyResult = await resolveProjectId('/opt/projects/unknown');

    upstreamClientMock.mockReturnValue(fakeUpstreamClient(vi.fn().mockResolvedValue({
      ok: true,
      value: [{ projectId: 'PID1', projectName: 'other', projectPath: '/opt/projects/other', instances: [] }],
    })));

    const candidateMismatchResult = await resolveProjectId('/opt/projects/unknown');

    // 一覧が空でも status と errorCode は一覧にプロジェクトがあって外れた場合と同じ
    // （specs `mcp/server`「この2つの状況に別々の errorCode を割り当ててはならない」）。
    // 区別は本文だけで行う。
    expect(emptyResult).toMatchObject({ ok: false, status: 404, errorCode: 'project_not_registered' });
    expect(candidateMismatchResult).toMatchObject({ ok: false, status: 404, errorCode: 'project_not_registered' });
    const emptyError = (emptyResult as { error: string }).error;
    const mismatchError = (candidateMismatchResult as { error: string }).error;
    expect(emptyError).not.toEqual(mismatchError);
    expect(emptyError).toContain('/opt/projects/unknown');
    // 一覧が空だったことが本文から読み取れる。
    expect(emptyError).toContain('空');
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
