import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/proposal.ts`（A7 の受理・実行の決着・W2 の接続時配信）。
 *
 * 見るのは**受理が残すだけであること**・出し直しで判断を持ち越さないこと・候補名の採り方・
 * **決着の順序（phase を書く → 配信する）**と、接続時に流すものの選び方である。受理してよい
 * 局面かの門は endpoint が、流してよい局面の集合は route が持つので、ここには来ない
 * （`test/server/api/strokes/proposal/index.post.test.ts`）。
 *
 * **局面の切り替えと配信は受理から決着へ移した**（change fix-rename-during-running-session）。
 * A7 が phase を `proposed` にしていた頃は、claude の実行が終わる前に承認できる局面が立ち、
 * 承認 → 昇格の改名が走っている実行を置き去りにした。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { write, read, recordLaunchSubmissionIfActive } = vi.hoisted(() => ({
  write: vi.fn(async () => undefined),
  read: vi.fn(async (): Promise<string | undefined> => undefined),
  recordLaunchSubmissionIfActive: vi.fn(() => undefined),
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/session-store')>()),
  readState: vi.fn(),
  writeState: vi.fn(async () => undefined),
  markProposalStrokeIfFirst: vi.fn(async () => undefined),
  sessionProposal: vi.fn(() => ({ write, read })),
}));

// 記録そのものの振る舞い（起動単位・畳まれた後は記録しない）は
// `test/server/utils/stroke/submission-signal.test.ts` が見る。ここは呼ばれ方だけを見る
vi.mock('../../../server/utils/stroke/submission-signal', () => ({ recordLaunchSubmissionIfActive }));

const { submitProposal, settleProposal, currentProposal } = await import('../../../server/handler/proposal');
const { readState, writeState, markProposalStrokeIfFirst } = await import(
  '../../../server/utils/stroke/session-store'
);
const { proposalChannel } = await import('../../../server/utils/stroke/ws-channels');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const markerMock = vi.mocked(markProposalStrokeIfFirst);
const publish = vi.spyOn(proposalChannel, 'publish');

const PROPOSAL = '# 提案\n\n本文。';
const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

/** route が渡す集合と同じもの。`stroking` はまだ proposal を持たない */
const DELIVERABLE = ['proposed', 'approved', 'activated'] as const;

/** その提出を起こした claude の接続（`x-stroke-token`）。endpoint が素通しで渡す */
const TOKEN = 'launch-token-1';

describe('submitProposal', () => {
  beforeEach(() => {
    write.mockClear().mockResolvedValue(undefined);
    markerMock.mockClear();
    writeStateMock.mockClear().mockResolvedValue(undefined);
    publish.mockClear();
    recordLaunchSubmissionIfActive.mockClear();
  });

  /**
   * **phase を進めず、流さない。** どちらも決着（`settleProposal`）が持つ。受理の段で
   * `proposed` を立てると、claude の実行が終わる前に承認できる局面が立つ
   * （change fix-rename-during-running-session）。
   */
  it('残して記録するだけ。phase を進めず、配信もしない', async () => {
    await submitProposal('session-1', STROKING, PROPOSAL, 'example-project', TOKEN);

    expect(write).toHaveBeenCalledWith(PROPOSAL);
    expect(markerMock).toHaveBeenCalledWith('session-1');
    // いまの局面をそのまま書き戻す
    expect(writeStateMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ phase: 'stroking', projectName: 'example-project' }),
    );
    expect(recordLaunchSubmissionIfActive).toHaveBeenCalledWith(TOKEN, 'proposal');
    expect(publish).not.toHaveBeenCalled();
  });

  /**
   * 残すのが先である。逆順にすると、状態だけ書けて本文が残っていない状態が作れてしまう
   * （`docs/specs/api/contract.md` A7）。
   */
  it('本文を残してから状態を書く', async () => {
    await submitProposal('session-1', STROKING, PROPOSAL, 'example-project', TOKEN);

    const [wrote] = write.mock.invocationCallOrder;
    const [wroteState] = writeStateMock.mock.invocationCallOrder;
    expect(wrote).toBeLessThan(wroteState!);
  });

  it('残せなければ状態も書かず、記録もしない', async () => {
    write.mockRejectedValueOnce(new Error('残せない'));

    await expect(submitProposal('session-2', STROKING, PROPOSAL, 'example-project', TOKEN)).rejects.toThrow('残せない');

    expect(writeStateMock).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(recordLaunchSubmissionIfActive).not.toHaveBeenCalled();
  });

  /** token の有無で記録するかを決めるのは記録の側である。ここは受け取ったものを渡すだけ */
  it('token を持たない提出も受理し、記録の口へはそのまま渡す', async () => {
    await submitProposal('session-3', STROKING, PROPOSAL, 'example-project', undefined);

    expect(recordLaunchSubmissionIfActive).toHaveBeenCalledWith(undefined, 'proposal');
  });

  /**
   * 判断はそれが下された proposal に結びつく（openspec/specs/api/session/approve）。前の状態を
   * 丸ごと写さないので、`proposed` からの出し直しに乗っている `decision` はここで落ちる。
   * **局面そのものは動かさない**ので、`proposed` からの出し直しは `proposed` のまま残る。
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
      TOKEN,
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
      TOKEN,
    );

    expect(writeStateMock).toHaveBeenCalledWith('session-1', expect.objectContaining({ projectName: 'kept-name' }));
  });

  it('候補名がどこにも無ければ projectName を持たない状態を書く', async () => {
    await submitProposal('session-1', STROKING, PROPOSAL, undefined, TOKEN);

    const [, written] = writeStateMock.mock.calls[0]!;
    expect('projectName' in written).toBe(false);
  });
});

describe('settleProposal', () => {
  beforeEach(() => {
    write.mockClear().mockResolvedValue(undefined);
    read.mockReset().mockResolvedValue(PROPOSAL);
    writeStateMock.mockClear().mockResolvedValue(undefined);
    publish.mockClear();
  });

  /**
   * 逆順にすると、配信だけ届いて局面が動いていない状態が作れてしまう
   * （`server/handler/proposal.ts`「**書いてから流す**」）。
   */
  it('phase を proposed にし、currentQuestion を消してから配信する', async () => {
    await expect(
      settleProposal('session-1', { ...STROKING, projectName: 'example-project', retries: 1 }),
    ).resolves.toBe(true);

    expect(writeStateMock).toHaveBeenCalledWith('session-1', {
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 1,
      projectName: 'example-project',
    });
    expect(publish).toHaveBeenCalledWith('session-1', { proposal: PROPOSAL, projectName: 'example-project' });

    const [advanced] = writeStateMock.mock.invocationCallOrder;
    const [published] = publish.mock.invocationCallOrder;
    expect(advanced!).toBeLessThan(published!);
  });

  it('候補名が無ければ null を流す', async () => {
    await expect(settleProposal('session-1', STROKING)).resolves.toBe(true);

    const [, written] = writeStateMock.mock.calls[0]!;
    expect('projectName' in written).toBe(false);
    expect(publish).toHaveBeenCalledWith('session-1', { proposal: PROPOSAL, projectName: null });
  });

  /**
   * 受理が成立していれば本文は残っている（A7 は残せなければ受理しない）。無いなら決着の前提が
   * 成り立たないので、局面を動かさずに断る——呼び手（A9）が 409 phase に写す。
   */
  it('本文が残っていなければ局面を動かさず、配信もせずに false を返す', async () => {
    read.mockResolvedValueOnce(undefined);

    await expect(settleProposal('session-1', STROKING)).resolves.toBe(false);

    expect(writeStateMock).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('phase を書けなければそのまま投げ、配信もしない', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('書けない'));

    await expect(settleProposal('session-1', STROKING)).rejects.toThrow('書けない');

    expect(publish).not.toHaveBeenCalled();
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
