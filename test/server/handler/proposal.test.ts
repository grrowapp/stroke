import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/proposal.ts`（A7 の受理と W2 の接続時配信）。
 *
 * 見るのは**順序（残す → phase を進める → 配信する）**・出し直しで判断を持ち越さないこと・
 * 候補名の採り方と、接続時に流すものの選び方である。受理してよい局面かの門は endpoint が、
 * 流してよい局面の集合は route が持つので、ここには来ない
 * （`test/server/api/strokes/proposal/index.post.test.ts`）。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { write, read } = vi.hoisted(() => ({
  write: vi.fn(async () => undefined),
  read: vi.fn(async (): Promise<string | undefined> => undefined),
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(),
  writeState: vi.fn(async () => undefined),
  markProposalStrokeIfFirst: vi.fn(async () => undefined),
  sessionProposal: vi.fn(() => ({ write, read })),
}));

const { submitProposal, currentProposal } = await import('../../../server/handler/proposal');
const { readState, writeState, markProposalStrokeIfFirst } = await import(
  '../../../server/utils/stroke/session-store'
);
const { proposalChannel } = await import('../../../server/utils/stroke/ws-channels');
const { submissionCount } = await import('../../../server/utils/stroke/submission-signal');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const markerMock = vi.mocked(markProposalStrokeIfFirst);
const publish = vi.spyOn(proposalChannel, 'publish');

const PROPOSAL = '# 提案\n\n本文。';
const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

/** route が渡す集合と同じもの。`stroking` はまだ proposal を持たない */
const DELIVERABLE = ['proposed', 'approved', 'activated'] as const;

describe('submitProposal', () => {
  beforeEach(() => {
    write.mockClear().mockResolvedValue(undefined);
    markerMock.mockClear();
    writeStateMock.mockClear();
    publish.mockClear();
  });

  /**
   * 逆順にすると、配信だけ届いて残っていない状態が作れてしまう
   * （`docs/specs/api/contract.md` A7「順序は『残す → phase を進める → W2 配信』」）。
   */
  it('残してから phase を進め、最後に配信する', async () => {
    await submitProposal('session-1', STROKING, PROPOSAL, 'example-project');

    expect(write).toHaveBeenCalledWith(PROPOSAL);
    expect(markerMock).toHaveBeenCalledWith('session-1');
    expect(writeStateMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ phase: 'proposed', projectName: 'example-project' }),
    );
    expect(publish).toHaveBeenCalledWith('session-1', { proposal: PROPOSAL, projectName: 'example-project' });

    const [wrote] = write.mock.invocationCallOrder;
    const [advanced] = writeStateMock.mock.invocationCallOrder;
    const [published] = publish.mock.invocationCallOrder;
    expect(wrote).toBeLessThan(advanced!);
    expect(advanced!).toBeLessThan(published!);
  });

  it('残せなければ phase も進めず、配信もしない', async () => {
    const before = submissionCount('session-2');
    write.mockRejectedValueOnce(new Error('残せない'));

    await expect(submitProposal('session-2', STROKING, PROPOSAL, 'example-project')).rejects.toThrow('残せない');

    expect(writeStateMock).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(submissionCount('session-2')).toBe(before);
  });

  it('提出を数える', async () => {
    const before = submissionCount('session-3');

    await submitProposal('session-3', STROKING, PROPOSAL, 'example-project');

    expect(submissionCount('session-3')).toBe(before + 1);
  });

  /**
   * 判断はそれが下された proposal に結びつく（openspec/specs/api/session/approve）。前の状態を
   * 丸ごと写さないので、`proposed` からの出し直しに乗っている `decision` はここで落ちる。
   */
  it('出し直すと記録されていた承認の判断は失効する', async () => {
    await submitProposal(
      'session-1',
      {
        phase: 'proposed',
        currentQuestion: null,
        invocation: 'idle',
        retries: 1,
        decision: { projectName: 'decided-on-old-proposal' },
      },
      PROPOSAL,
      'example-project',
    );

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    const [, written] = writeStateMock.mock.calls[0]!;
    expect(written).toEqual({
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 1,
      projectName: 'example-project',
    });
    // 失効は出し直しそのものを妨げない
    expect(write).toHaveBeenCalledWith(PROPOSAL);
  });

  /** kebab-case でない候補名は 400 にならない。受理は成立し、既に在る候補が残るだけ */
  it('kebab-case でない候補名は採らず、既に在る候補を残す', async () => {
    await submitProposal(
      'session-1',
      { ...STROKING, projectName: 'kept-name' },
      PROPOSAL,
      'Not Kebab Case',
    );

    expect(writeStateMock).toHaveBeenCalledWith('session-1', expect.objectContaining({ projectName: 'kept-name' }));
    expect(publish).toHaveBeenCalledWith('session-1', { proposal: PROPOSAL, projectName: 'kept-name' });
  });

  it('候補名がどこにも無ければ projectName を持たない状態を書き、null を流す', async () => {
    await submitProposal('session-1', STROKING, PROPOSAL, undefined);

    const [, written] = writeStateMock.mock.calls[0]!;
    expect('projectName' in written).toBe(false);
    expect(publish).toHaveBeenCalledWith('session-1', { proposal: PROPOSAL, projectName: null });
  });
});

describe('currentProposal', () => {
  beforeEach(() => {
    readStateMock.mockReset();
    read.mockReset().mockResolvedValue(PROPOSAL);
  });

  it.each(DELIVERABLE)('%s なら残っている proposal を流す形で返す', async (phase) => {
    readStateMock.mockResolvedValue({ phase, projectName: 'example-project', currentQuestion: null, invocation: 'idle' } as never);

    await expect(currentProposal('session-1', DELIVERABLE)).resolves.toEqual({
      proposal: PROPOSAL,
      projectName: 'example-project',
    });
  });

  it('候補名が無ければ projectName は null', async () => {
    readStateMock.mockResolvedValue({ phase: 'proposed', currentQuestion: null, invocation: 'idle' } as never);

    await expect(currentProposal('session-1', DELIVERABLE)).resolves.toEqual({
      proposal: PROPOSAL,
      projectName: null,
    });
  });

  it('集合の外の局面では本文を読みにも行かない', async () => {
    readStateMock.mockResolvedValue(STROKING as never);

    await expect(currentProposal('session-1', DELIVERABLE)).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('本文がまだ残っていなければ null', async () => {
    readStateMock.mockResolvedValue({ phase: 'proposed', currentQuestion: null, invocation: 'idle' } as never);
    read.mockResolvedValueOnce(undefined);

    await expect(currentProposal('session-1', DELIVERABLE)).resolves.toBeNull();
  });

  /** 読めないことを無言で「流すものが無い」に倒さない */
  it('state.json が読めなければそのまま投げる', async () => {
    readStateMock.mockRejectedValue(new Error('読めない'));

    await expect(currentProposal('session-1', DELIVERABLE)).rejects.toThrow('読めない');
  });
});
