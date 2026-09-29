import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ADMIN_USER, stubNitroGlobals, type FakeEvent } from '../../support';
import { deriveProjectId } from '../../../../../server/utils/upstream/project-id';

/**
 * 対象は `server/api/projects/[projectId]/index.delete.ts`（P1）。
 *
 * 見るのは2つ。**実行中かどうかを見ないこと**——「実行中だから受理しない」（409 busy）は
 * 契約から無くなった。削除の操作は生成の失敗の決着でしか出ないので、実行中に届かない
 * （fix-rename-during-running-session）。そして受理範囲——作りきれなかった（`approved`）
 * ものだけを消し、完成した（`activated`）ものは `.spec-workflow/` の有無によらず消さない
 * こと（specs/api/project/delete・add-activated-phase design D5）。
 *
 * `running.ts` と `session-store.ts` は実物のまま使う（`useRuntimeConfig` の差し替えは
 * `sessions/[id]/index.delete.test.ts` と同じ）。
 */

const config = vi.hoisted(() => ({ root: '' }));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: config.root }),
}));

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({ projectShareRoot: config.root }),
}));

stubNitroGlobals();

const { default: deleteHandler } = await import('../../../../../server/api/projects/[projectId]/index.delete');
const { beginRun, endRun } = await import('../../../../../server/utils/stroke/running');

const PROJECT_NAME = 'promoted-project';

/** P1 は router param を `projectId` という名前で読む（`fakeEvent` は `id` で作る）。 */
function eventFor(projectId: string): FakeEvent {
  return { params: { projectId }, body: undefined, status: undefined, context: { accessUser: Promise.resolve(ADMIN_USER) } };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function place(name: string, state: Record<string, unknown> | string, specWorkflow = false): Promise<string> {
  await mkdir(join(root, name), { recursive: true });
  const body = typeof state === 'string' ? state : JSON.stringify(state);
  await writeFile(join(root, name, 'state.json'), body, 'utf8');
  if (specWorkflow) await mkdir(join(root, name, '.spec-workflow', 'approvals'), { recursive: true });
  return deriveProjectId(join(root, name));
}

let root: string;
let projectId: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'delete-project-'));
  config.root = root;
  projectId = await place(PROJECT_NAME, { phase: 'approved', projectName: PROJECT_NAME, invocation: 'idle' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('P1 DELETE /api/projects/:projectId — 実行中を見ない', () => {
  it('実行の枠が取られていても断らない。「実行中だから受理しない」は無い', async () => {
    const start = await beginRun(join(root, PROJECT_NAME));
    if (!start.started) throw new Error('枠を取れなかった');
    try {
      const response = await deleteHandler(eventFor(projectId) as never);

      expect((response as Response).status).toBe(204);
      expect(await exists(join(root, PROJECT_NAME))).toBe(false);
    } finally {
      endRun(start.key);
    }
  });

  it('普通に削除できる', async () => {
    const response = await deleteHandler(eventFor(projectId) as never);

    expect((response as Response).status).toBe(204);
    expect(await exists(join(root, PROJECT_NAME))).toBe(false);
  });

  it('存在しないプロジェクトは 404 になる', async () => {
    await expect(deleteHandler(eventFor('does-not-exist') as never)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('P1 DELETE /api/projects/:projectId — 受理範囲', () => {
  it('作りきれなかった（approved）ものは .spec-workflow/ を持っていても消える', async () => {
    // 生成（P2）の依頼を本家が受理したときに `.spec-workflow/` はできる。steering が終わらないまま
    // 失敗したプロジェクトは、それを持ったまま「破棄する」を選ばれる
    const id = await place('half-made', { phase: 'approved', projectName: 'half-made', invocation: 'error' }, true);

    const response = await deleteHandler(eventFor(id) as never);

    expect((response as Response).status).toBe(204);
    expect(await exists(join(root, 'half-made'))).toBe(false);
  });

  it('完成した（activated）ものは 409 phase で断り、何も消さない', async () => {
    const id = await place('real', { phase: 'activated', projectName: 'real', invocation: 'idle' }, true);

    await expect(deleteHandler(eventFor(id) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('中身のある'),
    });
    expect(await exists(join(root, 'real'))).toBe(true);
  });

  it('まだプロジェクトになっていない（proposed）ものは 409 phase で断る', async () => {
    const id = await place('session-x', { phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(deleteHandler(eventFor(id) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('まだプロジェクトになっていない'),
    });
    expect(await exists(join(root, 'session-x'))).toBe(true);
  });

  it('壊れた state.json は 409 phase で断り、消さない（分からないものを通さない）', async () => {
    const id = await place('broken', 'not json', true);

    await expect(deleteHandler(eventFor(id) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(await exists(join(root, 'broken'))).toBe(true);
  });
});
