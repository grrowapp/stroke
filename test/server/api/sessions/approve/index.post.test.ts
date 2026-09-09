import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/approve/index.post.ts`（U10）。位置の付け方は
 * `test/server/api/strokes/question/index.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 *
 * **見るのは準備と後始末だけである**——404 / 400 / 局面の 409 と、受理できたときに handler へ
 * 渡すもの、handler が返した理由を 409 の文言へ写すこと。判断を書く実処理（改名しない・
 * `phase` を動かさない・衝突をその場で伝える）は `test/server/handler/approve.test.ts`。
 */

const { recordDecision } = vi.hoisted(() => ({
  recordDecision: vi.fn(async () => ({ ok: true }) as { ok: boolean, reason?: string }),
}));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/handler/approve', () => ({ recordDecision }));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: '/share' }),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => PROPOSED),
  };
});

stubNitroGlobals();

const { default: approveHandler } = await import('../../../../../server/api/sessions/[id]/approve/index.post');
const { readState, sessionExists } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const PROPOSED = { phase: 'proposed', currentQuestion: null, invocation: 'idle', retries: 0 } as const;
const BODY = { projectName: 'decided-app' };

describe('U10 POST /api/sessions/:id/approve', () => {
  beforeEach(() => {
    recordDecision.mockReset().mockResolvedValue({ ok: true });
    readStateMock.mockReset().mockResolvedValue(PROPOSED);
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  it('判断の記録を handler へ渡して 204', async () => {
    const response = await approveHandler(fakeEvent(SESSION, BODY) as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(204);
    expect(recordDecision).toHaveBeenCalledWith('/share', SESSION, PROPOSED, 'decided-app');
  });

  it('既に判断が記録されていれば受理しない', async () => {
    recordDecision.mockResolvedValueOnce({ ok: false, reason: 'already-decided' });

    await expect(approveHandler(fakeEvent(SESSION, { projectName: 'later' }) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('既に記録されている'),
    });
  });

  it('proposal が残っていなければ受理しない', async () => {
    recordDecision.mockResolvedValueOnce({ ok: false, reason: 'no-proposal' });

    await expect(approveHandler(fakeEvent(SESSION, BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: '承認する proposal が見つからない。',
    });
  });

  it('昇格した後に承認が届いても受理せず、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(approveHandler(fakeEvent('made', BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に承認済み。',
    });
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('完成した（activated）後も同じく受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(approveHandler(fakeEvent('made', BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に承認済み。',
    });
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('proposal が出ていない局面（stroking）では受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(approveHandler(fakeEvent(SESSION, BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: '承認できるのは proposal が出ているときだけ。',
    });
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('存在しない id への承認は 404 で、状態も読まない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(approveHandler(fakeEvent('missing', BODY) as never)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(readStateMock).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it('本文にプロジェクト名が無ければ 400', async () => {
    await expect(approveHandler(fakeEvent(SESSION, {}) as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(recordDecision).not.toHaveBeenCalled();
  });
});
