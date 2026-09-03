import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 昇格したプロジェクトの列挙（`server/utils/control/creating.ts`）。
 *
 * phase 付きで返す（add-activated-phase design D8）。読みは `readState`（zod）に寄せてあり、
 * 生読みを持たない（design D6）。`readState` は `useRuntimeConfig` を通るので、差し込み先を
 * 差し替えて保存先を一時ディレクトリへ向ける。
 */

const share = vi.hoisted(() => ({ root: '' }));

vi.mock('#app/nuxt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRuntimeConfig: () => ({ projectShareRoot: share.root }),
}));

vi.stubGlobal(
  'createError',
  (input: { statusCode: number; message: string }) => Object.assign(new Error(input.message), input),
);

const { listPromotedProjects } = await import('../../../../server/utils/control/creating');

async function place(name: string, state: Record<string, unknown> | string | null): Promise<void> {
  await mkdir(join(share.root, name), { recursive: true });
  if (state === null) return;
  const body = typeof state === 'string' ? state : JSON.stringify(state);
  await writeFile(join(share.root, name, 'state.json'), body, 'utf8');
}

beforeEach(async () => {
  share.root = await mkdtemp(join(tmpdir(), 'creating-'));
});

afterEach(async () => {
  await rm(share.root, { recursive: true, force: true });
});

describe('listPromotedProjects', () => {
  it('approved と activated を phase 付きで返す', async () => {
    await place('generating', { phase: 'approved', projectName: 'generating', invocation: 'idle' });
    await place('completed', { phase: 'activated', projectName: 'completed', invocation: 'idle' });

    const promoted = await listPromotedProjects(share.root);

    expect(promoted.map((p) => [p.name, p.phase]).sort()).toEqual([
      ['completed', 'activated'],
      ['generating', 'approved'],
    ]);
    expect(promoted.find((p) => p.name === 'generating')?.path).toBe(join(share.root, 'generating'));
  });

  it('まだプロジェクトになっていないセッションは載せない', async () => {
    await place('s1', { phase: 'stroking', currentQuestion: null, invocation: 'idle' });
    await place('s2', { phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    expect(await listPromotedProjects(share.root)).toEqual([]);
  });

  it('読めないもの・state.json を持たないものは飛ばす', async () => {
    await place('broken', 'not json');
    await place('odd', { phase: 'nonsense', projectName: 'odd', invocation: 'idle' });
    await place('plain-dir', null);
    await place('ok', { phase: 'approved', projectName: 'ok', invocation: 'idle' });

    expect((await listPromotedProjects(share.root)).map((p) => p.name)).toEqual(['ok']);
  });

  it('親パスが無ければ空', async () => {
    expect(await listPromotedProjects(null)).toEqual([]);
    expect(await listPromotedProjects(join(share.root, 'missing'))).toEqual([]);
  });
});
