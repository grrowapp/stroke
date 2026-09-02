import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../support';

/**
 * 対象は `server/api/sessions/[id]/index.delete.ts`（U11）。
 *
 * 見るのは、busy 判定が U13（起動）・P1（プロジェクト削除）・U10（承認）と同じ事実
 * （作業場所ディレクトリの実体）を見ていること（fix-rename-during-running-session）。
 * `running.ts` は実物のまま使い、`beginRun` で枠を占有した状態から確かめる。
 */

const config = vi.hoisted(() => ({ root: '' }));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: config.root }),
}));

vi.mock('../../../../server/utils/stroke/submission-signal', () => ({
  forgetSubmissions: vi.fn(),
}));

// `requireSessionId`（`session-param.ts`）は `session-store.ts` の `sessionExists` を
// 呼ぶ。実体は `useRuntimeConfig()` を通るため（Nitro の外では解決できない）モックし、
// このテストの `root` の下に対象があるかどうかで答える。
vi.mock('../../../../server/utils/stroke/session-store', async () => {
  const { access: fsAccess } = await import('node:fs/promises');
  const { join: pathJoin } = await import('node:path');
  return {
    sessionExists: async (id: string) => {
      try {
        await fsAccess(pathJoin(config.root, id, 'state.json'));
        return true;
      } catch {
        return false;
      }
    },
  };
});

stubNitroGlobals();

const { default: deleteHandler } = await import('../../../../server/api/sessions/[id]/index.delete');
const { beginRun, endRun } = await import('../../../../server/utils/stroke/running');

const SESSION_ID = 'session-uuid';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'delete-session-'));
  config.root = root;
  await mkdir(join(root, SESSION_ID), { recursive: true });
  await writeFile(join(root, SESSION_ID, 'state.json'), JSON.stringify({ phase: 'proposed' }), 'utf8');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('U11 DELETE /api/sessions/:id — busy', () => {
  it('実行中（起動と同じキー）は 409 busy で断り、何も消さない', async () => {
    const key = await beginRun(join(root, SESSION_ID));
    try {
      const event = fakeEvent(SESSION_ID, undefined);

      await expect(deleteHandler(event as never)).rejects.toMatchObject({
        statusCode: 409,
        data: { reason: 'busy' },
      });

      expect(await exists(join(root, SESSION_ID))).toBe(true);
    } finally {
      endRun(key);
    }
  });

  it('実行が終わった後は削除できる', async () => {
    const event = fakeEvent(SESSION_ID, undefined);

    const response = await deleteHandler(event as never);

    expect((response as Response).status).toBe(204);
    expect(await exists(join(root, SESSION_ID))).toBe(false);
  });

  it('存在しないセッションは busy より先に 404 になる', async () => {
    const event = fakeEvent('does-not-exist', undefined);

    await expect(deleteHandler(event as never)).rejects.toMatchObject({ statusCode: 404 });
  });
});
