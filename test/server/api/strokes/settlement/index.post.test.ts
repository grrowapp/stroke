import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/settlement/index.post.ts`（A9）。位置の付け方は
 * `question/index.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 *
 * A9 は**実行の決着**の受け口である。叩くのは invoke-agent だけで、claude（エージェント）と
 * 画面は叩かない（openspec/specs/agent/invocation）。提出を受ける口（A5・A7）は記録だけを
 * 行い、局面の切り替えと配信はここから始まる（change fix-rename-during-running-session）。
 *
 * **見るのは準備と後始末だけである**——読み取れない本文の 400、昇格後の 409、決着を断られた
 * ときの 409、通ったときに handler へ渡すものと 204 の返し方。局面を切り替えることと配信する
 * ことの実処理は `test/server/handler/settlement.test.ts` と、そこから呼ばれる
 * `test/server/handler/{question,proposal}.test.ts`。
 */

const { settle } = vi.hoisted(() => ({ settle: vi.fn(async () => true) }));

vi.mock('../../../../../server/handler/settlement', () => ({ settle }));

// ステータスの観測点。理由は `../../support.ts` の `stubNitroGlobals` に書いてある
vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => STROKING),
}));

stubNitroGlobals();

const { default: settlementHandler } = await import('../../../../../server/api/strokes/[id]/settlement/index.post');
const { readState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);

const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

describe('A9 POST /api/strokes/:id/settlement', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(STROKING);
    settle.mockReset().mockResolvedValue(true);
  });

  /** 受理と記録で完結する操作は本文を持たない 204 を返す（A5・A7 と同じ契約） */
  it.each(['question', 'proposal'] as const)('%s の決着を handler へ渡し、本文なしの 204 を返す', async (submitted) => {
    const event = fakeEvent('session-1', { submitted });

    const body = await settlementHandler(event as never);

    // 断った後の状態をそのまま渡す——局面を切り替えるのは handler の役目である
    expect(settle).toHaveBeenCalledWith('session-1', STROKING, submitted);
    expect(body).toBeInstanceOf(Response);
    expect((body as Response).status).toBe(204);
    expect(await (body as Response).text()).toBe('');
  });

  it('submitted を持たない本文は 400 で弾き、handler を呼ばない', async () => {
    const event = fakeEvent('session-1', {});

    await expect(settlementHandler(event as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(settle).not.toHaveBeenCalled();
  });

  it('提出の種別として読み取れない値は 400 で弾き、handler を呼ばない', async () => {
    const event = fakeEvent('session-1', { submitted: 'steering' });

    await expect(settlementHandler(event as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(settle).not.toHaveBeenCalled();
  });

  /**
   * 昇格後（`approved` / `activated`）の実行は steering で、ストロークの決着を持たない
   * （完成の記録は U15）。
   */
  it.each(['approved', 'activated'] as const)('昇格後の %s には 409 を返し、handler を呼ばない', async (phase) => {
    readStateMock.mockResolvedValueOnce({ phase, projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', { submitted: 'proposal' });

    await expect(settlementHandler(event as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('昇格した対象にストロークの決着は無い。'),
    });
    expect(settle).not.toHaveBeenCalled();
  });

  /**
   * 決着の前提が成り立たない（残っている proposal が無い）ときは、局面を動かさずに断る。
   * 呼び手（invoke-agent）はこれを失敗として扱い、起動し直しの対象にする。
   */
  it('handler が決着を断ったら 409 phase を返す', async () => {
    settle.mockResolvedValueOnce(false);
    const event = fakeEvent('session-1', { submitted: 'proposal' });

    await expect(settlementHandler(event as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('残っている proposal が無い。'),
    });
    expect(event.status).toBeUndefined();
  });
});
