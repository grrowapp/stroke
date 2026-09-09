import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
<<<<<<<< HEAD:test/server/api/strokes/invoke-agent/multiplex.test.ts
 * 対象は `server/api/strokes/[id]/invoke-agent/index.get.ts`（U13）。ここだけは
========
 * 対象は `server/api/sessions/[id]/invoke-agent/index.get.ts`（U13）。ここだけは
>>>>>>>> 426ccf1a895dcf35c52c947dee547f82f0357425:test/server/api/sessions/invoke-agent/multiplex.test.ts
 * `server/utils/stroke/running.ts` を実物のまま使い、`fix-rename-during-running-session`
 * の核心——**同じ物理ディレクトリに対し、異なる id で二重起動が通らないこと**
 * （openspec/specs/api/session/invoke-agent「昇格の前後で同じディレクトリに起動が
 * 要求される」）を見る。
 *
 * `./index.get.test.ts` は `running` を丸ごとモックしているので、busy の
 * 判定そのものは見ない（見るのは endRun/beginRun の呼ばれ方）。
 */

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/readiness', () => ({
  missingPrerequisites: vi.fn(async () => []),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(async () => ({ phase: 'stroking', invocation: 'idle', retries: 0 })),
  sessionExists: vi.fn(async () => true),
}));

const invoke = vi.hoisted(() => ({ kick: vi.fn() }));
vi.mock('../../../../../server/utils/stroke/invoke', () => invoke);

stubNitroGlobals();

interface QueryEvent extends FakeEvent {
  query: Record<string, string>;
}

function eventWithQuery(id: string, query: Record<string, string> = {}): QueryEvent {
  return { ...fakeEvent(id, undefined), query };
}

vi.stubGlobal('getQuery', (event: QueryEvent) => event.query);

<<<<<<<< HEAD:test/server/api/strokes/invoke-agent/multiplex.test.ts
const { default: invokeAgentHandler } = await import('../../../../../server/api/strokes/[id]/invoke-agent/index.get');
========
const { default: invokeAgentHandler } = await import('../../../../../server/api/sessions/[id]/invoke-agent/index.get');
>>>>>>>> 426ccf1a895dcf35c52c947dee547f82f0357425:test/server/api/sessions/invoke-agent/multiplex.test.ts

let dir: string;

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

    const first = eventWithQuery('session-uuid', { cwd: dir });
    await invokeAgentHandler(first as never);
    expect(first.status).toBe(200);

    // 2つ目: 別の id（承認後のプロジェクト名を想定）だが、同じ物理ディレクトリを cwd に持つ
    const second = eventWithQuery('renamed-project', { cwd: dir });
    await expect(invokeAgentHandler(second as never)).rejects.toMatchObject({
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

    const first = eventWithQuery('session-uuid', { cwd: dir });
    await invokeAgentHandler(first as never);

    // settled が解決し終わるのを待つ（endRun が finally で呼ばれる）
    await Promise.resolve();
    await Promise.resolve();

    invoke.kick.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.resolve() });
    const second = eventWithQuery('renamed-project', { cwd: dir });
    const body = await invokeAgentHandler(second as never);

    expect(second.status).toBe(200);
    expect(body).toEqual({});
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

      const first = eventWithQuery('session-uuid', { cwd: dir });
      await invokeAgentHandler(first as never);
      expect(first.status).toBe(200);

      invoke.kick.mockReturnValueOnce({ built: Promise.resolve(), settled: Promise.resolve() });
      const second = eventWithQuery('other-session', { cwd: otherDir });
      const body = await invokeAgentHandler(second as never);

      expect(second.status).toBe(200);
      expect(body).toEqual({});

      finishFirstSettled();
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });
});
