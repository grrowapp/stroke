import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stubNitroGlobals } from '../api/support';

/**
 * 対象は `server/handler/invoke-agent.ts`（U13 の実処理）。ここだけは
 * `server/utils/stroke/running.ts` を実物のまま使い、`fix-rename-during-running-session`
 * の核心——**同じ物理ディレクトリに対し、異なる id で二重起動が通らないこと**
 * （openspec/specs/api/session/invoke-agent「昇格の前後で同じディレクトリに起動が
 * 要求される」）を見る。
 *
 * `./invoke-agent.test.ts` は `running` を丸ごとモックしているので、busy の
 * 判定そのものは見ない（見るのは endRun/beginRun の呼ばれ方）。
 */

const invoke = vi.hoisted(() => ({ kick: vi.fn() }));
vi.mock('../../../server/utils/stroke/invoke', () => invoke);

// busy の 409 は `running.ts` が `conflict()`（`createError`）で作る。Nitro の全域が要る
stubNitroGlobals();

const { invokeAgent } = await import('../../../server/handler/invoke-agent');

let dir: string;

/** 起動1回分。phase と回数は endpoint が決めて渡すもので、ここでは固定でよい */
function run(sessionId: string, cwd: string): Promise<void> {
  return invokeAgent({ sessionId, cwd, phase: 'stroking', retries: 0 });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'invoke-multiplex-'));
  invoke.kick.mockReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('U13: 同じ実体のディレクトリへの多重起動', () => {
  it('異なる id でも同じ物理ディレクトリを cwd に持つ起動は busy で断られる', async () => {
    // 1つ目: まだ AI の応答の完了を待っている状態にする（settled を保留する）
    let finishFirstSettled = (): void => {};
    invoke.kick.mockReturnValueOnce({
      built: Promise.resolve(),
      settled: new Promise<void>((resolve) => { finishFirstSettled = resolve; }),
    });

    await run('session-uuid', dir);

    // 2つ目: 別の id（承認後のプロジェクト名を想定）だが、同じ物理ディレクトリを cwd に持つ
    await expect(run('renamed-project', dir)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'busy' },
    });

    // 2つ目は busy で断られたので kick は1回しか呼ばれていない
    expect(invoke.kick).toHaveBeenCalledTimes(1);

    // 後片付け: 1つ目の実行を終わらせて busy ガードを解放する
    finishFirstSettled();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('1つ目が終わった後は、同じディレクトリへ別の id で起動できる', async () => {
    invoke.kick.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.resolve() });

    await run('session-uuid', dir);

    // settled が解決し終わるのを待つ（endRun が finally で呼ばれる）
    await Promise.resolve();
    await Promise.resolve();

    invoke.kick.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.resolve() });

    await expect(run('renamed-project', dir)).resolves.toBeUndefined();
    expect(invoke.kick).toHaveBeenCalledTimes(2);
  });

  it('別のディレクトリなら、実行中でも同時に起動できる', async () => {
    const otherDir = await mkdtemp(join(tmpdir(), 'invoke-multiplex-other-'));
    try {
      let finishFirstSettled = (): void => {};
      invoke.kick.mockReturnValueOnce({
        built: Promise.resolve(),
        settled: new Promise<void>((resolve) => { finishFirstSettled = resolve; }),
      });

      await run('session-uuid', dir);

      invoke.kick.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.resolve() });

      await expect(run('other-session', otherDir)).resolves.toBeUndefined();

      finishFirstSettled();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });
});
