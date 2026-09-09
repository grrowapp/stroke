import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/answer.ts`（U7 の実処理）。
 *
 * 見るのは**同じ入力の再送で往復が二重に入らない**ことだけである（decisions.md）。
 * 受理してよい局面かの門は endpoint が持つので、ここには来ない
 * （`test/server/api/sessions/answer/index.post.test.ts`）。
 */

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/session-store')>()),
  readStrokes: vi.fn(async () => []),
  appendAnswerStroke: vi.fn(async () => undefined),
}));

const { recordAnswer } = await import('../../../server/handler/answer');
const { appendAnswerStroke, readStrokes } = await import('../../../server/utils/stroke/session-store');

const appendMock = vi.mocked(appendAnswerStroke);
const readStrokesMock = vi.mocked(readStrokes);

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
};
const ANSWER = { kind: 'option', value: 'JSON' } as const;
const LAST_STROKE = { proposal: false, question: QUESTION, answer: ANSWER };

describe('recordAnswer', () => {
  beforeEach(() => {
    appendMock.mockClear();
    readStrokesMock.mockReset().mockResolvedValue([]);
  });

  it('記録する', async () => {
    await recordAnswer('session-1', QUESTION as never, ANSWER as never, 'idle');

    expect(appendMock).toHaveBeenCalledWith('session-1', QUESTION, ANSWER);
  });

  it('実行が失敗した後の同じ問い・同じ回答の再送は追記しない', async () => {
    readStrokesMock.mockResolvedValueOnce([LAST_STROKE] as never);

    await recordAnswer('session-1', QUESTION as never, ANSWER as never, 'failed');

    expect(appendMock).not.toHaveBeenCalled();
  });

  it('実行が失敗していなければ、同じ内容でも追記する（再送の判定は failed のときだけ）', async () => {
    readStrokesMock.mockResolvedValueOnce([LAST_STROKE] as never);

    await recordAnswer('session-1', QUESTION as never, ANSWER as never, 'idle');

    expect(appendMock).toHaveBeenCalledOnce();
  });

  it('failed でも回答が違えば追記する', async () => {
    readStrokesMock.mockResolvedValueOnce([LAST_STROKE] as never);

    await recordAnswer('session-1', QUESTION as never, { kind: 'free', value: '別の答え' } as never, 'failed');

    expect(appendMock).toHaveBeenCalledOnce();
  });

  it('末尾が proposal の往復なら再送とは見ない', async () => {
    readStrokesMock.mockResolvedValueOnce([{ proposal: true, question: null, answer: null }] as never);

    await recordAnswer('session-1', QUESTION as never, ANSWER as never, 'failed');

    expect(appendMock).toHaveBeenCalledOnce();
  });
});
