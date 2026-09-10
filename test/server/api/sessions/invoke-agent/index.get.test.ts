import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/invoke-agent/index.get.ts`（U13）。テストの位置はソースの
 * 構造を写すが、`[id]` の段は挟まない（`test/server/api/strokes/question/index.post.test.ts` の注記と同じ事情）。
 *
 * **見るのは準備と後始末だけである**——前提の確認（503）、クエリから cwd と再実行を読むこと、
 * 状態から phase・回数・会話の続き先を組んで handler へ渡すこと、handler の失敗（`InvokeError`）を
 * 503 へ写すこと、受理したときの 200。占有と `kick` の扱いは
 * `test/server/handler/invoke-agent.test.ts`・`invoke-agent-multiplex.test.ts`。
 */

const { invokeAgent, InvokeError } = vi.hoisted(() => {
  class InvokeError extends Error {
    constructor(public readonly kind: string, message: string) {
      super(message);
      this.name = 'InvokeError';
    }
  }
  return { invokeAgent: vi.fn(async () => undefined), InvokeError };
});

vi.mock('../../../../../server/handler/invoke-agent', () => ({ invokeAgent, InvokeError }));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/readiness', () => ({
  missingPrerequisites: vi.fn(async () => []),
}));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: '/tmp/share' }),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(async () => ({ phase: 'stroking', invocation: 'idle', retries: 0 })),
  sessionExists: vi.fn(async () => true),
}));

stubNitroGlobals();

/** クエリ付きの要求。`FakeEvent` は query を持たないので、その場で足す。 */
interface QueryEvent extends FakeEvent {
  query: Record<string, string>;
}

function eventWithQuery(id: string, query: Record<string, string> = {}): QueryEvent {
  return { ...fakeEvent(id, undefined), query };
}

vi.stubGlobal('getQuery', (event: QueryEvent) => event.query);

const { default: invokeAgentHandler } = await import('../../../../../server/api/sessions/[id]/invoke-agent/index.get');
const { missingPrerequisites } = await import('../../../../../server/utils/readiness');
const { readState } = await import('../../../../../server/utils/stroke/session-store');

const missingPrerequisitesMock = vi.mocked(missingPrerequisites);
const readStateMock = vi.mocked(readState);

describe('U13 GET /api/sessions/:id/invoke-agent', () => {
  beforeEach(() => {
    missingPrerequisitesMock.mockClear();
    missingPrerequisitesMock.mockResolvedValue([]);
    readStateMock.mockClear();
    readStateMock.mockResolvedValue({ phase: 'stroking', invocation: 'idle', retries: 0 } as never);
    invokeAgent.mockClear();
    invokeAgent.mockResolvedValue(undefined);
  });

  it('起動を handler へ渡し、200 を返す', async () => {
    const event = eventWithQuery('session-1', { cwd: '/tmp/share/session-1' });
    const body = await invokeAgentHandler(event as never);

    expect(event.status).toBe(200);
    expect(body).toEqual({});
    expect(invokeAgent).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/tmp/share/session-1',
      phase: 'stroking',
      retries: 0,
      runId: undefined,
    });
  });

  it('cwd が無ければセッションディレクトリを既定にする', async () => {
    await invokeAgentHandler(eventWithQuery('session-1') as never);

    expect(invokeAgent).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/tmp/share/session-1' }));
  });

  it('reset が付いていればリトライ回数を 0 に戻して渡す', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', invocation: 'failed', retries: 2 } as never);

    await invokeAgentHandler(eventWithQuery('session-1', { reset: '1' }) as never);

    expect(invokeAgent).toHaveBeenCalledWith(expect.objectContaining({ retries: 0 }));
  });

  it('reset が無ければ記録されている回数をそのまま渡す', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', invocation: 'failed', retries: 2 } as never);

    await invokeAgentHandler(eventWithQuery('session-1') as never);

    expect(invokeAgent).toHaveBeenCalledWith(expect.objectContaining({ retries: 2 }));
  });

  /**
   * U13 は phase を渡すだけで、定型の選び分けも完成の記録の要否も持たない
   * （add-activated-phase design D4）。完成済み（`activated`）の対象も同じ口で受理される。
   */
  it('完成した（activated）対象への起動を受理し、phase と会話の続き先を渡す', async () => {
    readStateMock.mockResolvedValueOnce({
      phase: 'activated',
      projectName: 'made-app',
      invocation: 'idle',
      retries: 0,
      runId: 'run-1',
    } as never);

    const event = eventWithQuery('made-app', { cwd: '/tmp/share/made-app' });
    await invokeAgentHandler(event as never);

    expect(event.status).toBe(200);
    expect(invokeAgent).toHaveBeenCalledWith({
      sessionId: 'made-app',
      cwd: '/tmp/share/made-app',
      phase: 'activated',
      retries: 0,
      runId: 'run-1',
    });
  });

  it('組み立てに失敗すれば 503 を返し、理由を message に含める', async () => {
    invokeAgent.mockRejectedValueOnce(
      new InvokeError('build', '起動の材料を組み立てられない: 設定を読めない') as never,
    );

    await expect(invokeAgentHandler(eventWithQuery('session-1') as never)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('設定を読めない'),
    });
  });

  it('handler が投げた他の失敗（busy の 409 など）はそのまま外へ出す', async () => {
    invokeAgent.mockRejectedValueOnce(Object.assign(new Error('占有中'), {
      statusCode: 409,
      data: { reason: 'busy' },
    }) as never);

    await expect(invokeAgentHandler(eventWithQuery('session-1') as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'busy' },
    });
  });

  it('前提が欠けていれば handler を呼ばず 503 を返す', async () => {
    missingPrerequisitesMock.mockResolvedValueOnce(['保存先が絶対パスでない: share']);

    await expect(invokeAgentHandler(eventWithQuery('session-1') as never)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('AI を起動できる状態にない'),
    });
    expect(invokeAgent).not.toHaveBeenCalled();
  });
});
