import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/activate/index.post.ts`（U15）。
 * spec は openspec/specs/api/session/activate（add-activated-phase）。
 *
 * **見るのは準備と後始末だけである**——404 と、完成を記録してよい局面（`approved`）を
 * literal で handler へ渡すこと、handler が観測したものを 409 phase の文言へ写すこと。
 * 記録そのもの（phase だけを動かす・配信する・判定を持たない）は
 * `test/server/handler/activate.test.ts`。
 */

const { recordActivation } = vi.hoisted(() => ({
  recordActivation: vi.fn(async () => ({ ok: true }) as { ok: boolean, observed?: string }),
}));

vi.mock('../../../../../server/handler/activate', () => ({ recordActivation }));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
}));

stubNitroGlobals();

const { default: activateHandler } = await import('../../../../../server/api/sessions/[id]/activate/index.post');
const { sessionExists } = await import('../../../../../server/utils/stroke/session-store');

const sessionExistsMock = vi.mocked(sessionExists);

const NAME = 'made-app';

describe('U15 POST /api/sessions/:id/activate', () => {
  beforeEach(() => {
    recordActivation.mockReset().mockResolvedValue({ ok: true });
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  it('完成を記録してよい局面（approved）を渡して 204 を返す', async () => {
    const response = await activateHandler(fakeEvent(NAME, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(recordActivation).toHaveBeenCalledWith(NAME, ['approved']);
  });

  it('まだ昇格していない（proposed）対象は 409 phase で断る', async () => {
    recordActivation.mockResolvedValueOnce({ ok: false, observed: 'proposed' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('まだ昇格していない'),
    });
  });

  it('既に完成した（activated）対象は 409 で断る', async () => {
    recordActivation.mockResolvedValueOnce({ ok: false, observed: 'activated' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('既に完成している'),
    });
  });

  it('state.json が読めなければ 409 phase で断る', async () => {
    recordActivation.mockResolvedValueOnce({ ok: false, observed: 'unreadable' });

    await expect(activateHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('state.json を読めない'),
    });
  });

  it('存在しない id は 404 で、記録を試みない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(activateHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
