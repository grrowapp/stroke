import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 中断したストロークの列挙（`server/utils/stroke/unfinished.ts`）。
 *
 * 完全な失敗に達したセッションへの戻り道は、上層の一覧がここを読んで出す
 * （`docs/specs/architecture/failure.md`「時間を置いて再開する」）。**見るのは `state.json` が
 * あることだけ**で、実行環境（openspec ルートとスキーマ設定）は検査しない——初回の起動に失敗した
 * セッションこそ戻り道が要るためである。
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

const { listUnfinishedStrokes } = await import('../../../../server/utils/stroke/unfinished');

async function place(name: string, state: Record<string, unknown> | string | null): Promise<void> {
  await mkdir(join(share.root, name), { recursive: true });
  if (state === null) return;
  const body = typeof state === 'string' ? state : JSON.stringify(state);
  await writeFile(join(share.root, name, 'state.json'), body, 'utf8');
}

beforeEach(async () => {
  share.root = await mkdtemp(join(tmpdir(), 'unfinished-'));
});

afterEach(async () => {
  await rm(share.root, { recursive: true, force: true });
});

describe('listUnfinishedStrokes', () => {
  it('昇格前のセッションを phase と実行の記録つきで返す', async () => {
    await place('s1', { phase: 'stroking', currentQuestion: null, invocation: 'error' });
    await place('s2', { phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    const sessions = await listUnfinishedStrokes(share.root);

    expect(sessions.map((s) => [s.id, s.phase, s.invocation]).sort()).toEqual([
      ['s1', 'stroking', 'error'],
      ['s2', 'proposed', 'idle'],
    ]);
    expect(sessions.find((s) => s.id === 's1')?.path).toBe(join(share.root, 's1'));
  });

  it('昇格した対象は返さない', async () => {
    await place('generating', { phase: 'approved', projectName: 'generating', invocation: 'idle' });
    await place('completed', { phase: 'activated', projectName: 'completed', invocation: 'idle' });

    expect(await listUnfinishedStrokes(share.root)).toEqual([]);
  });

  it('実行環境が無くても載せる', async () => {
    // **ここが U12 との違いである。** 初回の起動に失敗したセッションは openspec ルートを
    // 持たないが、完全な失敗に達して自動では動かないので、戻り道がいちばん要る対象になる
    await place('never-launched', { phase: 'stroking', currentQuestion: null, invocation: 'error' });

    const sessions = await listUnfinishedStrokes(share.root);

    expect(sessions.map((s) => s.id)).toEqual(['never-launched']);
  });

  it('state.json を持たないディレクトリと読めないものは飛ばす', async () => {
    await place('no-state', null);
    await place('broken', '{');
    await place('s1', { phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    const sessions = await listUnfinishedStrokes(share.root);

    expect(sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('保存先が未設定なら空で返す', async () => {
    expect(await listUnfinishedStrokes(null)).toEqual([]);
  });
});
