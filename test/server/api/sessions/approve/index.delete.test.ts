import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/approve/index.delete.ts`（U10 の取り消し）。位置の付け方は
 * `test/server/api/strokes/question/index.post.test.ts` と同じ。
 *
 * **見るのは準備と後始末だけである**——404 / 昇格後の 409 / 判断が無いときの 204、そして
 * 取り下げる状態を handler へ渡すこと。取り下げの実処理（`decision` だけが消え、`phase` も
 * 他のフィールドも変わらない）は `test/server/handler/approve.test.ts`。
 */

const { withdrawDecision } = vi.hoisted(() => ({ withdrawDecision: vi.fn(async () => undefined) }));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/handler/approve', () => ({ withdrawDecision }));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => DECIDED),
  };
});

stubNitroGlobals();

const { default: cancelHandler } = await import('../../../../../server/api/sessions/[id]/approve/index.delete');
const { readState, sessionExists } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  retries: 1,
  projectName: 'candidate',
  decision: { projectName: 'decided-app' },
} as const;

describe('DELETE /api/sessions/:id/approve', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    sessionExistsMock.mockReset().mockResolvedValue(true);
    withdrawDecision.mockClear();
  });

  it('判断の取り下げを handler へ渡して 204', async () => {
    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(withdrawDecision).toHaveBeenCalledWith(SESSION, DECIDED);
  });

  it('昇格が済んだ対象への取り消しは受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(cancelHandler(fakeEvent('made', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('昇格した後は取り消せない'),
    });
    expect(withdrawDecision).not.toHaveBeenCalled();
  });

  it('完成した（activated）対象への取り消しも受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(cancelHandler(fakeEvent('made', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('昇格した後は取り消せない'),
    });
    expect(withdrawDecision).not.toHaveBeenCalled();
  });

  it('判断が無いセッションへの取り消しは何も変えない（204）', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(withdrawDecision).not.toHaveBeenCalled();
  });

  it('proposal が出る前（stroking）も何も変えない（204）', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(withdrawDecision).not.toHaveBeenCalled();
  });

  it('存在しない id への取り消しは 404', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(cancelHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(withdrawDecision).not.toHaveBeenCalled();
  });
});
