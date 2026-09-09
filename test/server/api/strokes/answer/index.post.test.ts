import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/answer/index.post.ts`（U7）。位置の付け方は
 * `question/index.post.test.ts` と同じ。
 *
 * 見るのは承認以降の門（openspec/specs/api/session/answer・add-activated-phase design D10）。
 * `approved` も `activated` も「承認済み」の理由で断り、「答えるべき問いが無い」に落ちない。
 */

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => STROKING),
  readStrokes: vi.fn(async () => []),
  appendAnswerStroke: vi.fn(async () => undefined),
}));

stubNitroGlobals();

const { default: answerHandler } = await import('../../../../../server/api/strokes/[id]/answer/index.post');
const { appendAnswerStroke, readState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const appendMock = vi.mocked(appendAnswerStroke);

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
};
const ANSWER = { kind: 'option', value: 'JSON' };
const STROKING = { phase: 'stroking', currentQuestion: QUESTION, invocation: 'idle', retries: 0 } as const;

describe('U7 POST /api/strokes/:id/answer — 承認以降の門', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(STROKING);
    appendMock.mockClear();
  });

  it('stroking の問いには答えられ、記録されて 204', async () => {
    const response = await answerHandler(fakeEvent('session-1', ANSWER) as never);

    expect((response as Response).status).toBe(204);
    expect(appendMock).toHaveBeenCalledWith('session-1', QUESTION, ANSWER);
  });

  it('approved には「承認済み」で断り、何も記録しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(answerHandler(fakeEvent('made', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('承認済み'),
    });
    expect(appendMock).not.toHaveBeenCalled();
  });

  it('activated にも同じ「承認済み」で断る。「答えるべき問いが無い」に落ちない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(answerHandler(fakeEvent('made', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('承認済み'),
    });
    expect(appendMock).not.toHaveBeenCalled();
  });

  it('承認前でも問いが無ければ「答えるべき問いが無い」', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(answerHandler(fakeEvent('session-1', ANSWER) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('答えるべき問いが無い'),
    });
  });
});
