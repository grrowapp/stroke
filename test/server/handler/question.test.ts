import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/question.ts`（A5 の受理と W1 の接続時配信）。
 *
 * 見るのは**残す・流す・数える**の3つと、接続時に流すものの選び方だけである。受理してよい
 * 局面かの門は endpoint が、流してよい局面の集合は route が持つので、ここには来ない
 * （`test/server/api/strokes/question/index.post.test.ts`）。
 */

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(),
  writeState: vi.fn(async () => undefined),
}));

const { submitQuestion, currentQuestion } = await import('../../../server/handler/question');
const { readState, writeState } = await import('../../../server/utils/stroke/session-store');
const { questionChannel } = await import('../../../server/utils/stroke/ws-channels');
const { submissionCount } = await import('../../../server/utils/stroke/submission-signal');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const publish = vi.spyOn(questionChannel, 'publish');

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
} as const;

/** route が渡す集合と同じもの。承認以降は問いを持たない */
const DELIVERABLE = ['stroking', 'proposed'] as const;

describe('submitQuestion', () => {
  beforeEach(() => {
    writeStateMock.mockClear();
    publish.mockClear();
  });

  it('受理した問いを残し、W1 へ流し、提出を数える', async () => {
    const before = submissionCount('session-1');
    const state = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

    await submitQuestion('session-1', state, QUESTION as never);

    expect(writeStateMock).toHaveBeenCalledWith('session-1', {
      phase: 'stroking',
      currentQuestion: QUESTION,
      invocation: 'idle',
    });
    expect(publish).toHaveBeenCalledWith('session-1', QUESTION);
    expect(submissionCount('session-1')).toBe(before + 1);
  });

  /**
   * `invocation` には触れない（openspec/specs/agent/invocation の MUST）。判断も回数も
   * 差し替えの対象ではないので、問い以外は丸ごと残る。
   */
  it('問い以外の項目を1つも動かさない', async () => {
    const state = {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'failed',
      retries: 2,
      projectName: 'example-project',
      decision: { projectName: 'example-project' },
    } as const;

    await submitQuestion('session-1', state, QUESTION as never);

    expect(writeStateMock).toHaveBeenCalledWith('session-1', { ...state, currentQuestion: QUESTION });
  });

  it('残せなければ流さず、数えない', async () => {
    const before = submissionCount('session-2');
    writeStateMock.mockRejectedValueOnce(new Error('書けない'));

    await expect(
      submitQuestion('session-2', { phase: 'stroking', currentQuestion: null, invocation: 'idle' }, QUESTION as never),
    ).rejects.toThrow('書けない');

    expect(publish).not.toHaveBeenCalled();
    expect(submissionCount('session-2')).toBe(before);
  });
});

describe('currentQuestion', () => {
  beforeEach(() => {
    readStateMock.mockReset();
  });

  it('集合に当てはまる局面なら現在の1問を返す', async () => {
    readStateMock.mockResolvedValue({ phase: 'stroking', currentQuestion: QUESTION, invocation: 'idle' } as never);

    await expect(currentQuestion('session-1', DELIVERABLE)).resolves.toEqual(QUESTION);
  });

  it('当てはまっても問いが無ければ null', async () => {
    readStateMock.mockResolvedValue({ phase: 'proposed', currentQuestion: null, invocation: 'idle' } as never);

    await expect(currentQuestion('session-1', DELIVERABLE)).resolves.toBeNull();
  });

  /** 昇格後の形（`PromotedState`）は問いの項目そのものを持たない */
  it.each(['approved', 'activated'] as const)('%s は集合の外なので null', async (phase) => {
    readStateMock.mockResolvedValue({ phase, projectName: 'example', invocation: 'idle' } as never);

    await expect(currentQuestion('session-1', DELIVERABLE)).resolves.toBeNull();
  });

  /** 受理する局面を決めるのは呼び出し元である。集合を絞れば当てはまらなくなる */
  it('集合を絞れば同じ状態でも流さない', async () => {
    readStateMock.mockResolvedValue({ phase: 'proposed', currentQuestion: QUESTION, invocation: 'idle' } as never);

    await expect(currentQuestion('session-1', ['stroking'])).resolves.toBeNull();
    await expect(currentQuestion('session-1', DELIVERABLE)).resolves.toEqual(QUESTION);
  });

  /** 読めないことを無言で「流すものが無い」に倒さない */
  it('state.json が読めなければそのまま投げる', async () => {
    readStateMock.mockRejectedValue(new Error('読めない'));

    await expect(currentQuestion('session-1', DELIVERABLE)).rejects.toThrow('読めない');
  });
});
