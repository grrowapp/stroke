import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../support';

/**
 * 対象は `server/api/strokes/[id]/invoke-agent.get.ts`（U13）。テストの位置はソースの
 * 構造を写すが、`[id]` の段は挟まない（`question.post.test.ts` の注記と同じ事情）。
 *
 * 見るのは fix-idle-stuck-on-run-build-failure の3点。
 *
 * - 組み立てに失敗すると（`kick` の `built` が reject すると）200 ではなく 503 を返す
 * - 応答は `built` までしか待たない。`settled`（AI の応答の完了）は待たない
 * - 受理しなかったときも busy ガード（`endRun`）が解ける
 */

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../server/utils/readiness', () => ({
  missingPrerequisites: vi.fn(async () => []),
}));

vi.mock('../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(async () => ({ phase: 'stroking', invocation: 'idle', retries: 0 })),
  sessionExists: vi.fn(async () => true),
}));

const running = vi.hoisted(() => ({
  beginRun: vi.fn(async (path: string) => `key:${path}`),
  endRun: vi.fn(),
}));
vi.mock('../../../../server/utils/stroke/running', () => running);

const invoke = vi.hoisted(() => ({ kick: vi.fn() }));
vi.mock('../../../../server/utils/stroke/invoke', () => invoke);

stubNitroGlobals();

/** クエリ付きの要求。`FakeEvent` は query を持たないので、その場で足す。 */
interface QueryEvent extends FakeEvent {
  query: Record<string, string>;
}

function eventWithQuery(id: string, query: Record<string, string> = {}): QueryEvent {
  return { ...fakeEvent(id, undefined), query };
}

vi.stubGlobal('getQuery', (event: QueryEvent) => event.query);

const { default: invokeAgentHandler } = await import('../../../../server/api/strokes/[id]/invoke-agent.get');
const { missingPrerequisites } = await import('../../../../server/utils/readiness');
const { readState } = await import('../../../../server/utils/stroke/session-store');

const missingPrerequisitesMock = vi.mocked(missingPrerequisites);
const readStateMock = vi.mocked(readState);

/** `kick` の戻り値を組み立てる。`built`/`settled` は個別に制御できる。 */
function kickResult(built: Promise<void>, settled: Promise<void>): { built: Promise<void>, settled: Promise<void> } {
  return { built, settled };
}

describe('U13 GET /api/strokes/:id/invoke-agent', () => {
  beforeEach(() => {
    missingPrerequisitesMock.mockClear();
    missingPrerequisitesMock.mockResolvedValue([]);
    readStateMock.mockClear();
    readStateMock.mockResolvedValue({ phase: 'stroking', invocation: 'idle', retries: 0 } as never);
    running.beginRun.mockClear();
    running.endRun.mockClear();
    invoke.kick.mockClear();
  });

  it('組み立てに成功すれば 200 を返し、AI の応答の完了（settled）は待たない', async () => {
    let finishSettled = (): void => {};
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.resolve(),
      new Promise<void>((resolve) => { finishSettled = resolve; }),
    ));

    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });
    const body = await invokeAgentHandler(event as never);

    expect(event.status).toBe(200);
    expect(body).toEqual({});
    // busy ガードはまだ解けていない（settled が終わっていない）
    expect(running.endRun).not.toHaveBeenCalled();

    finishSettled();
    await Promise.resolve();
    await Promise.resolve();
    // キーは cwd から引く（id ではない）。beginRun が返したキーで endRun する
    expect(running.beginRun).toHaveBeenCalledWith('/tmp/share/session-1');
    expect(running.endRun).toHaveBeenCalledWith('key:/tmp/share/session-1');
  });

  it('組み立てに失敗すれば 503 を返し、理由を message に含める', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.reject(new Error('起動の材料を組み立てられない: 設定を読めない')),
      Promise.resolve(),
    ));

    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });

    await expect(invokeAgentHandler(event as never)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('設定を読めない'),
    });
  });

  it('組み立てに失敗しても busy ガード（endRun）は解ける', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(
      Promise.reject(new Error('組み立てに失敗')),
      Promise.resolve(),
    ));

    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });
    await expect(invokeAgentHandler(event as never)).rejects.toThrow();

    // settled は resolve 済みなので、endRun はすでに解けている
    await Promise.resolve();
    await Promise.resolve();
    expect(running.endRun).toHaveBeenCalledWith('key:/tmp/share/session-1');
  });

  /**
   * U13 は phase を渡すだけで、定型の選び分けも完成の記録の要否も持たない
   * （add-activated-phase design D4）。完成済み（`activated`）の対象も同じ口で受理される。
   */
  it('完成した（activated）対象への起動を受理し、phase と会話の続き先を kick に渡す', async () => {
    readStateMock.mockResolvedValueOnce({
      phase: 'activated',
      projectName: 'made-app',
      invocation: 'idle',
      retries: 0,
      runId: 'run-1',
    } as never);
    invoke.kick.mockReturnValueOnce(kickResult(Promise.resolve(), Promise.resolve()));

    const event = eventWithQuery('made-app', { cwd: '/tmp/share/made-app' });
    await invokeAgentHandler(event as never);

    expect(event.status).toBe(200);
    expect(invoke.kick).toHaveBeenCalledWith({
      sessionId: 'made-app',
      cwd: '/tmp/share/made-app',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
    });
  });

  it('ストロークのセッションでは会話の続き先を渡さない', async () => {
    invoke.kick.mockReturnValueOnce(kickResult(Promise.resolve(), Promise.resolve()));

    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });
    await invokeAgentHandler(event as never);

    expect(invoke.kick).toHaveBeenCalledWith(expect.objectContaining({ phase: 'stroking', runId: undefined }));
  });

  it('前提が欠けていれば kick を呼ばず 503 を返す', async () => {
    missingPrerequisitesMock.mockResolvedValueOnce(['保存先が絶対パスでない: share']);

    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });

    await expect(invokeAgentHandler(event as never)).rejects.toMatchObject({ statusCode: 503 });
    expect(invoke.kick).not.toHaveBeenCalled();
    expect(running.beginRun).not.toHaveBeenCalled();
  });
});
