import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/answer/index.post.ts`（U7）。位置の付け方は
 * `test/server/api/strokes/question/index.post.test.ts` と同じ。
 *
 * **見るのは準備と後始末だけである**——承認以降の門（openspec/specs/api/session/answer・
 * add-activated-phase design D10）と、通ったときに handler へ渡すもの。`approved` も
 * `activated` も「承認済み」の理由で断り、「答えるべき問いが無い」に落ちない。
 * 記録の実処理（再送で往復を二重に入れない）は `test/server/handler/answer.test.ts`。
 */

const { recordAnswer } = vi.hoisted(() => ({ recordAnswer: vi.fn(async () => undefined) }));

vi.mock('../../../../../server/handler/answer', () => ({ recordAnswer }));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => STROKING),
}));

stubNitroGlobals();

const { default: answerHandler } = await import('../../../../../server/api/sessions/[id]/answer/index.post');
const { readState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
};
const ANSWER = { kind: 'option', value: 'JSON' };
const STROKING = { phase: 'stroking', currentQuestion: QUESTION, invocation: 'idle', retries: 0 } as const;

describe('U7 POST /api/sessions/:id/answer — 承認以降の門', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(STROKING);
    recordAnswer.mockClear();
  });

  it('stroking の問いには答えられ、handler へ渡して 204', async () => {
    const response = await answerHandler(fakeEvent('session-1', ANSWER) as never);

    expect((response as Response).status).toBe(204);
    // 実行の記録（`invocation`）まで渡す——再送かどうかの判定材料は handler が持つ
    expect(recordAnswer).toHaveBeenCalledWith('session-1', QUESTION, ANSWER, 'idle');
  });

  it('approved には「承認済み」で断り、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(answerHandler(fakeEvent('made', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('承認済み'),
    });
    expect(recordAnswer).not.toHaveBeenCalled();
  });

  it('activated にも同じ「承認済み」で断る。「答えるべき問いが無い」に落ちない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(answerHandler(fakeEvent('made', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('承認済み'),
    });
    expect(recordAnswer).not.toHaveBeenCalled();
  });

  it('承認前でも問いが無ければ「答えるべき問いが無い」', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(answerHandler(fakeEvent('session-1', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('答えるべき問いが無い'),
    });
    expect(recordAnswer).not.toHaveBeenCalled();
  });
});
