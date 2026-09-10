import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/question.ts`（A5 の受理・実行の決着・W1 の接続時配信）。
 *
 * 見るのは**残す・記録する・決着で流す**の3つと、接続時に流すものの選び方だけである。受理して
 * よい局面かの門は endpoint が、流してよい局面の集合は route が持つので、ここには来ない
 * （`test/server/api/strokes/question/index.post.test.ts`）。
 *
 * **受理と配信は別の段である**（change fix-rename-during-running-session）。A5 は記録するだけで
 * 流さず、流すのは実行の決着（`settleQuestion`）である。受理した瞬間に流すと、claude の実行が
 * まだ終わっていないのに回答できる状態が立ち、その回答が要求する次の起動が走っている実行と
 * 重なる。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { recordLaunchSubmissionIfActive } = vi.hoisted(() => ({
  recordLaunchSubmissionIfActive: vi.fn(() => undefined),
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(),
  writeState: vi.fn(async () => undefined),
}));

// 記録そのものの振る舞い（起動単位・畳まれた後は記録しない）は
// `test/server/utils/stroke/submission-signal.test.ts` が見る。ここは呼ばれ方だけを見る
vi.mock('../../../server/utils/stroke/submission-signal', () => ({ recordLaunchSubmissionIfActive }));

const { submitQuestion, settleQuestion, currentQuestion } = await import('../../../server/handler/question');
const { readState, writeState } = await import('../../../server/utils/stroke/session-store');
const { questionChannel } = await import('../../../server/utils/stroke/ws-channels');

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

/** その提出を起こした claude の接続（`x-stroke-token`）。endpoint が素通しで渡す */
const TOKEN = 'launch-token-1';

const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

describe('submitQuestion', () => {
  beforeEach(() => {
    writeStateMock.mockClear().mockResolvedValue(undefined);
    publish.mockClear();
    recordLaunchSubmissionIfActive.mockClear();
  });

  /**
   * **流さない。** 配信は決着（`settleQuestion`）が持つ。受理の段で流すと、実行が終わる前に
   * 回答できる状態が立つ（change fix-rename-during-running-session）。
   */
  it('受理した問いを残し、その起動の提出として記録する。流さない', async () => {
    await submitQuestion('session-1', STROKING, QUESTION as never, TOKEN);

    expect(writeStateMock).toHaveBeenCalledWith('session-1', {
      phase: 'stroking',
      currentQuestion: QUESTION,
      invocation: 'idle',
    });
    expect(recordLaunchSubmissionIfActive).toHaveBeenCalledWith(TOKEN, 'question');
    expect(publish).not.toHaveBeenCalled();
  });

  /**
   * `invocation` には触れない（openspec/specs/agent/invocation の MUST）。判断も回数も
   * 差し替えの対象ではないので、問い以外は丸ごと残る。**phase も動かない。**
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

    await submitQuestion('session-1', state, QUESTION as never, TOKEN);

    expect(writeStateMock).toHaveBeenCalledWith('session-1', { ...state, currentQuestion: QUESTION });
  });

  it('残せなければ記録しない', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('書けない'));

    await expect(
      submitQuestion('session-2', STROKING, QUESTION as never, TOKEN),
    ).rejects.toThrow('書けない');

    expect(recordLaunchSubmissionIfActive).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  /** token の有無で記録するかを決めるのは記録の側である。ここは受け取ったものを渡すだけ */
  it('token を持たない提出も受理し、記録の口へはそのまま渡す', async () => {
    await submitQuestion('session-1', STROKING, QUESTION as never, undefined);

    expect(recordLaunchSubmissionIfActive).toHaveBeenCalledWith(undefined, 'question');
  });
});

describe('settleQuestion', () => {
  beforeEach(() => {
    writeStateMock.mockClear().mockResolvedValue(undefined);
    publish.mockClear();
  });

  /** 決着で初めて W1 へ届く。局面は動かさない——問いは phase を進めない */
  it('記録されている今の1問を W1 へ流す', async () => {
    await settleQuestion('session-1', { ...STROKING, currentQuestion: QUESTION } as never);

    expect(publish).toHaveBeenCalledWith('session-1', QUESTION);
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('残っている問いが無ければ流さない', async () => {
    await settleQuestion('session-1', STROKING as never);

    expect(publish).not.toHaveBeenCalled();
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
