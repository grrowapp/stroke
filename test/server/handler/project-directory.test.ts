import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveProjectId } from '../../../server/utils/upstream/project-id';

/**
 * 対象は `server/handler/project-directory.ts`（一覧の組み立てと、`projectId` から
 * 保存先の名前を引く走査）。
 *
 * 見るのは2つ。承認待ちの件数を**アクティブなプロジェクトぶんだけ**数え、取れなかった
 * ものを0件と混ぜずに一覧の組み立てへ渡すこと。そして、`projectId` から名前を引く走査が
 * 導出値の一致だけで決めること。
 *
 * 返し方（404 / 409 / 204）は endpoint が持つので、ここには来ない
 * （`test/server/api/projects/[projectId]/index.delete.test.ts`）。
 */

const { buildProjectDirectory, listPendingApprovals, scanProjects, readRegistry, listPromotedProjects }
  = vi.hoisted(() => ({
    buildProjectDirectory: vi.fn(() => ({ status: 'not-configured' })),
    listPendingApprovals: vi.fn(),
    scanProjects: vi.fn(async () => ({ status: 'not-configured' })),
    readRegistry: vi.fn(async () => ({ status: 'ok', entries: [] })),
    listPromotedProjects: vi.fn(async () => []),
  }));

vi.mock('../../../server/utils/control/directory', () => ({ buildProjectDirectory }));
vi.mock('../../../server/utils/upstream/scan', () => ({ scanProjects }));
vi.mock('../../../server/utils/upstream/registry', () => ({ readRegistry }));
vi.mock('../../../server/utils/control/creating', () => ({ listPromotedProjects }));

vi.mock('../../../server/utils/upstream/rest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/upstream/rest')>()),
  UpstreamRestClient: class {
    listPendingApprovals = listPendingApprovals;
  },
}));

const { listProjectDirectory, resolveProjectName } = await import('../../../server/handler/project-directory');

const CONFIG = {
  projectsParentPath: '/opt/projects',
  specWorkflowHome: '/home/agent/.spec-workflow-mcp',
  upstreamBaseUrl: 'http://127.0.0.1:5000',
};

function entry(projectId: string, active: boolean) {
  return {
    projectId,
    projectPath: `/opt/projects/${projectId}`,
    workflowRootPath: `/opt/projects/${projectId}`,
    projectName: projectId,
    instances: active ? [{ pid: 1, registeredAt: '2026-09-09T00:00:00.000Z' }] : [],
  };
}

/** `buildProjectDirectory` へ渡された承認待ちの件数 */
function passedCounts(): ReadonlyMap<string, number> {
  return buildProjectDirectory.mock.calls[0]![2] as ReadonlyMap<string, number>;
}

describe('listProjectDirectory — 承認待ちの件数の合成', () => {
  beforeEach(() => {
    buildProjectDirectory.mockClear();
    listPendingApprovals.mockReset().mockResolvedValue({ ok: true, value: [{}, {}] });
    readRegistry.mockReset().mockResolvedValue({ status: 'ok', entries: [] });
  });

  it('アクティブなプロジェクトだけ本家へ問い合わせ、件数を渡す', async () => {
    readRegistry.mockResolvedValue({ status: 'ok', entries: [entry('ACTIVE', true), entry('IDLE', false)] } as never);

    await listProjectDirectory(CONFIG);

    expect(listPendingApprovals).toHaveBeenCalledOnce();
    expect(listPendingApprovals).toHaveBeenCalledWith('ACTIVE');
    expect([...passedCounts()]).toEqual([['ACTIVE', 2]]);
  });

  it('取れなかったプロジェクトは持たない（0件と混ぜない）', async () => {
    readRegistry.mockResolvedValue({ status: 'ok', entries: [entry('ACTIVE', true)] } as never);
    listPendingApprovals.mockResolvedValue({ ok: false, failure: { kind: 'not-configured' } });

    await listProjectDirectory(CONFIG);

    expect(passedCounts().has('ACTIVE')).toBe(false);
  });

  it('本家の URL が未設定なら問い合わせず、件数は空のまま', async () => {
    readRegistry.mockResolvedValue({ status: 'ok', entries: [entry('ACTIVE', true)] } as never);

    await listProjectDirectory({ ...CONFIG, upstreamBaseUrl: null });

    expect(listPendingApprovals).not.toHaveBeenCalled();
    expect(passedCounts().size).toBe(0);
  });

  it('registry が読めなければ、読めなかったことを添えて空の entries を渡す', async () => {
    readRegistry.mockResolvedValue({ status: 'unreadable', path: '/x', reason: 'broken' } as never);

    await listProjectDirectory(CONFIG);

    expect(buildProjectDirectory.mock.calls[0]![1]).toEqual({ entries: [], readable: false });
    expect(listPendingApprovals).not.toHaveBeenCalled();
  });
});

describe('resolveProjectName — projectId から保存先の名前を引く', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'resolve-project-name-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('導出値が一致するディレクトリの名前を返す', async () => {
    await mkdir(join(root, 'made-app'));
    await mkdir(join(root, 'other-app'));

    expect(await resolveProjectName(root, deriveProjectId(join(root, 'made-app')))).toBe('made-app');
  });

  it('一致するものが無ければ null', async () => {
    await mkdir(join(root, 'made-app'));

    expect(await resolveProjectName(root, 'no-such-id')).toBeNull();
  });

  it('保存先が未設定なら null', async () => {
    expect(await resolveProjectName(null, 'anything')).toBeNull();
  });

  it('保存先を読めなければ null', async () => {
    expect(await resolveProjectName(join(root, 'not-there'), 'anything')).toBeNull();
  });

  it('ディレクトリでないものは見ない', async () => {
    await writeFile(join(root, 'made-app'), '', 'utf8');

    expect(await resolveProjectName(root, deriveProjectId(join(root, 'made-app')))).toBeNull();
  });

  it('保存先の外へ出られる形の名前は見ない', async () => {
    await mkdir(join(root, '.hidden'));

    expect(await resolveProjectName(root, deriveProjectId(join(root, '.hidden')))).toBeNull();
  });
});
