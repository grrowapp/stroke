import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/promote/index.post.ts`（U14）。位置の付け方は
 * `test/server/api/strokes/question/index.post.test.ts` と同じ。
 *
 * **見るのは準備と後始末だけである**——404 と局面の 409（判断が記録されていない・既に昇格
 * している）、本文を取らずに判断から名前を取り出して handler へ渡すこと、204。昇格の実処理
 * （占有・衝突確認・改名・巻き戻し・判断の取り下げ・配信・A8 への引き渡し）は
 * `test/server/handler/promote.test.ts`。
 */

const { promote } = vi.hoisted(() => ({ promote: vi.fn(async () => undefined) }));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/handler/promote', () => ({ promote }));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: '/share' }),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => DECIDED),
  };
});

stubNitroGlobals();

const { default: promoteHandler } = await import('../../../../../server/api/sessions/[id]/promote/index.post');
const { readState, sessionExists } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const NAME = 'decided-app';
const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  retries: 0,
  decision: { projectName: NAME },
} as const;

describe('U14 POST /api/sessions/:id/promote', () => {
  beforeEach(() => {
    promote.mockReset().mockResolvedValue(undefined);
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  it('判断の名前を handler へ渡して 204 を返す', async () => {
    const response = await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(promote).toHaveBeenCalledWith('/share', SESSION, NAME);
  });

  it('本文の名前は使わない。判断と違う名前を送っても判断の名前で昇格する', async () => {
    await promoteHandler(fakeEvent(SESSION, { projectName: 'somebody-else' }) as never);

    expect(promote).toHaveBeenCalledWith('/share', SESSION, NAME);
  });

  it('判断が無ければ受理せず、昇格を試みない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('判断が記録されていない'),
    });
    expect(promote).not.toHaveBeenCalled();
  });

  it('proposal が出る前（stroking）は判断を持ちえないので受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({ statusCode: 409 });
    expect(promote).not.toHaveBeenCalled();
  });

  it('既に昇格した対象への重ねての昇格は受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: NAME, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に昇格している。',
    });
    expect(promote).not.toHaveBeenCalled();
  });

  it('完成した（activated）対象への昇格も受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: NAME, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に昇格している。',
    });
    expect(promote).not.toHaveBeenCalled();
  });

  it('存在しない id への昇格は 404 で、状態も読まない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(promoteHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(readStateMock).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it('handler が投げた失敗（409 busy・name-conflict など）はそのまま外へ出す', async () => {
    promote.mockRejectedValueOnce(Object.assign(new Error('この作業場所は AI の応答を待っている。'), {
      statusCode: 409,
      data: { reason: 'busy' },
    }) as never);

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'busy' },
    });
  });
});
