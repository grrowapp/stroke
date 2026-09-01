import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubNitroGlobals } from '../support';
import { deriveProjectId } from '../../../../server/utils/upstream/project-id';

/**
 * 対象は `server/api/projects/[projectId]/index.delete.ts`（P1）。
 *
 * 見るのは、busy 判定が U13（起動）・U11（セッション削除）・U10（承認）と同じ事実
 * （作業場所ディレクトリの実体）を見ていること（fix-rename-during-running-session）。
 * `running.ts` は実物のまま使い、`beginRun` で枠を占有した状態から確かめる。
 */

const config = vi.hoisted(() => ({ root: '' }));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: config.root }),
}));

stubNitroGlobals();

const { default: deleteHandler } = await import('../../../../server/api/projects/[projectId]/index.delete');
const { beginRun, endRun } = await import('../../../../server/utils/stroke/running');

const PROJECT_NAME = 'promoted-project';

/** P1 は router param を `projectId` という名前で読む（`fakeEvent` は `id` で作る）。 */
function eventFor(projectId: string): { params: Record<string, string>, body: unknown, status: number | undefined } {
  return { params: { projectId }, body: undefined, status: undefined };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let root: string;
let projectId: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'delete-project-'));
  config.root = root;
  await mkdir(join(root, PROJECT_NAME), { recursive: true });
  await writeFile(join(root, PROJECT_NAME, 'state.json'), JSON.stringify({ phase: 'approved' }), 'utf8');
  projectId = deriveProjectId(join(root, PROJECT_NAME));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('P1 DELETE /api/projects/:projectId — busy', () => {
  it('実行中（起動と同じキー）は 409 busy で断り、何も消さない', async () => {
    const key = await beginRun(join(root, PROJECT_NAME));
    try {
      const event = eventFor(projectId);

      await expect(deleteHandler(event as never)).rejects.toMatchObject({
        statusCode: 409,
        data: { reason: 'busy' },
      });

      expect(await exists(join(root, PROJECT_NAME))).toBe(true);
    } finally {
      endRun(key);
    }
  });

  it('実行が終わった後は削除できる', async () => {
    const event = eventFor(projectId);

    const response = await deleteHandler(event as never);

    expect((response as Response).status).toBe(204);
    expect(await exists(join(root, PROJECT_NAME))).toBe(false);
  });

  it('存在しないプロジェクトは busy より先に 404 になる', async () => {
    const event = eventFor('does-not-exist');

    await expect(deleteHandler(event as never)).rejects.toMatchObject({ statusCode: 404 });
  });
});
