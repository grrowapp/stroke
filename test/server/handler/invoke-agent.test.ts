import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/invoke-agent.ts`（U13 の実処理）。
 *
 * 見るのは fix-idle-stuck-on-run-build-failure の3点。
 *
 * - 組み立てに失敗すると（`kick` の `built` が reject すると）`InvokeError` を投げる
 * - 待つのは `built` までである。`settled`（AI の応答の完了）は待たない
 * - 受理しなかったときも busy ガード（`endRun`）が解ける
 *
 * 503 への写しは endpoint が持つ（`test/server/api/sessions/invoke-agent/index.get.test.ts`）。
 */

const running = vi.hoisted(() => ({
  beginRun: vi.fn(async (path: string) => `key:${path}`),
  endRun: vi.fn(),
}));
vi.mock('../../../server/utils/stroke/running', () => running);

const invoke = vi.hoisted(() => ({ kick: vi.fn() }));
vi.mock('../../../server/utils/stroke/invoke', () => invoke);

const { InvokeError, invokeAgent } = await import('../../../server/handler/invoke-agent');

const CWD = '/tmp/share/session-1';

/** `kick` の戻り値を組み立てる。`built`/`settled` は個別に制御できる。 */
function kickResult(built: Promise<void>, settled: Promise<void>): { built: Promise<void>, settled: Promise<void> } {
  return { built, settled };
}

describe('invokeAgent', () => {
  beforeEach(() => {
    running.beginRun.mockClear();
    running.endRun.mockClear();
    invoke.kick.mockClear();
  });

  it('組み立てに成功すれば返り、AI の応答の完了（settled）は待たない', async () => {
    let finishSettled = (): void => {};
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.resolve(),
      new Promise<void>((resolve) => { finishSettled = resolve; }),
    ));

    await invokeAgent({ sessionId: 'session-1', cwd: CWD, phase: 'stroking', retries: 0 });

    // busy ガードはまだ解けていない（settled が終わっていない）
    expect(running.endRun).not.toHaveBeenCalled();

    finishSettled();
    await Promise.resolve();
    await Promise.resolve();
    // キーは cwd から引く（id ではない）。beginRun が返したキーで endRun する
    expect(running.beginRun).toHaveBeenCalledWith(CWD);
    expect(running.endRun).toHaveBeenCalledWith(`key:${CWD}`);
  });

  it('組み立てに失敗すれば InvokeError を投げ、理由を message に含める', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.reject(new Error('設定を読めない')),
      Promise.resolve(),
    ));

    await expect(
      invokeAgent({ sessionId: 'session-1', cwd: CWD, phase: 'stroking', retries: 0 }),
    ).rejects.toMatchObject({
      kind: 'build',
      message: expect.stringContaining('設定を読めない'),
    });
  });

  it('組み立てに失敗しても busy ガード（endRun）は解ける', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.reject(new Error('組み立てに失敗')),
      Promise.resolve(),
    ));

    await expect(
      invokeAgent({ sessionId: 'session-1', cwd: CWD, phase: 'stroking', retries: 0 }),
    ).rejects.toBeInstanceOf(InvokeError);

    // settled は resolve 済みなので、endRun はすでに解けている
    await Promise.resolve();
    await Promise.resolve();
    expect(running.endRun).toHaveBeenCalledWith(`key:${CWD}`);
  });

  /**
   * どの定型にするか・完成の記録を試みるかは `invoke.ts` が phase から導く
   * （add-activated-phase design D4）。ここは受け取ったものをそのまま渡すだけである。
   */
  it('受け取った phase・回数・会話の続き先をそのまま kick へ渡す', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(Promise.resolve(), Promise.resolve()));

    await invokeAgent({
      sessionId: 'made-app',
      cwd: '/tmp/share/made-app',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
    });

    expect(invoke.kick).toHaveBeenCalledWith({
      sessionId: 'made-app',
      cwd: '/tmp/share/made-app',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
    });
  });
});
