import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/index.delete.ts`（U11）。**`[id]` の段を挟む**——
 * `test/server/api/sessions/` の直下は U1（`sessions/index.post.ts`）と U12
 * （`sessions/index.get.ts`）を写す位置なので、そこへ置くと対象を偽って指す。
 * `projects/[projectId]/index.delete.test.ts` と同型で、そちらと同じ形に畳んだ
 * （fix-session-api-namespace design「`test/server/api/sessions/index.delete.test.ts` の階層合わせ」）。
 *
 * 見るのは2つ。busy 判定が U13（起動）・P1（プロジェクト削除）・U10（承認）と同じ事実
 * （作業場所ディレクトリの実体）を見ていること（fix-rename-during-running-session）。
 * そして受理範囲——承認より前（`stroking` / `proposed`）だけを消し、昇格済み
 * （`approved` / `activated`）と壊れた `state.json` は消さないこと（add-activated-phase
 * design D5）。
 *
 * `running.ts` と `session-store.ts` は実物のまま使う。`readState` は `useRuntimeConfig` を
 * 通るので、差し込み先を差し替えて保存先を一時ディレクトリへ向ける
 * （`session-decision.test.ts` と同じ）。
 *
 * **消す実行（`handler/session.ts` → `handler/delete.ts`）も実物のまま通す。** ここが見たい
 * のは「断ったときに**何も消えていない**」ことで、それは保存先の実物でしか観測できない。
 * 実行そのものの検査（存在しない対象を消したことにしない・保存先の外へ出る名前を通さない）は
 * `test/server/handler/delete.test.ts`・`session.test.ts` が持ち、ここでは重ねない。
 */

const config = vi.hoisted(() => ({ root: '' }));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: config.root }),
}));

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({ projectShareRoot: config.root }),
}));

vi.mock('../../../../../server/utils/stroke/submission-signal', () => ({
  forgetSubmissions: vi.fn(),
}));

stubNitroGlobals();

const { default: deleteHandler } = await import('../../../../../server/api/sessions/[id]/index.delete');
const { beginRun, endRun } = await import('../../../../../server/utils/stroke/running');

const SESSION_ID = 'session-uuid';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function place(name: string, state: Record<string, unknown> | string): Promise<void> {
  await mkdir(join(root, name), { recursive: true });
  const body = typeof state === 'string' ? state : JSON.stringify(state);
  await writeFile(join(root, name, 'state.json'), body, 'utf8');
}

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'delete-session-'));
  config.root = root;
  await place(SESSION_ID, { phase: 'proposed', currentQuestion: null, invocation: 'idle' });
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

describe('U11 DELETE /api/sessions/:id — 受理範囲', () => {
  it('stroking も消せる', async () => {
    await place('fresh', { phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    const response = await deleteHandler(fakeEvent('fresh', undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(await exists(join(root, 'fresh'))).toBe(false);
  });

  it('昇格した（approved）ものは 409 phase で断り、何も消さない', async () => {
    await place('made', { phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(deleteHandler(fakeEvent('made', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(await exists(join(root, 'made'))).toBe(true);
  });

  it('完成した（activated）ものも 409 phase で断り、何も消さない', async () => {
    await place('done', { phase: 'activated', projectName: 'done', invocation: 'idle' });

    await expect(deleteHandler(fakeEvent('done', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(await exists(join(root, 'done'))).toBe(true);
  });

  it('壊れた state.json は 409 phase で断り、消さない（分からないものを通さない）', async () => {
    await place('broken', 'not json');

    await expect(deleteHandler(fakeEvent('broken', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
    });
    expect(await exists(join(root, 'broken'))).toBe(true);
  });

  it('集合に無い phase も消さない', async () => {
    await place('odd', { phase: 'nonsense', currentQuestion: null, invocation: 'idle' });

    await expect(deleteHandler(fakeEvent('odd', undefined) as never)).rejects.toMatchObject({ statusCode: 409 });
    expect(await exists(join(root, 'odd'))).toBe(true);
  });
});
