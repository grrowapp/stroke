import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/approve.ts`（U10 の実処理と、U14 からの取り下げ）。
 *
 * 見るのは「承認を受けても**ディレクトリの名前が変わらない**・`phase` が `proposed` の
 * まま・起動が要求されない」ことと、取り下げが `decision` だけを落とすこと。局面の門
 * （昇格済みか・`proposed` か）は endpoint が持つのでここには来ない
 * （`test/server/api/sessions/approve/**`）。
 */

const { read, promoteSessionToProject, assertNameAvailable, fetchMock } = vi.hoisted(() => ({
  read: vi.fn(async (): Promise<string | undefined> => '# proposal'),
  promoteSessionToProject: vi.fn(async () => '/share/decided-app'),
  assertNameAvailable: vi.fn(async (_root: string, name: string) => `/share/${name}`),
  fetchMock: vi.fn(async () => undefined),
}));

// 定数（`PROJECT_DOCS_DIR` など）は session-store が引くので本物を残し、動作だけ差し替える
vi.mock('../../../server/utils/stroke/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/stroke/project')>()),
  assertNameAvailable,
  promoteSessionToProject,
  revertPromotion: vi.fn(async () => undefined),
}));

vi.mock('../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    readState: vi.fn(async () => DECIDED),
    writeState: vi.fn(async () => undefined),
    sessionProposal: vi.fn(() => ({ read })),
  };
});

// 起動の要求（U13）が出ていないことの観測点。判断の記録は $fetch を一切呼ばない
vi.stubGlobal('$fetch', fetchMock);

const { recordDecision, withdrawConflictedDecision, withdrawDecision } = await import(
  '../../../server/handler/approve'
);
const { readState, writeState } = await import('../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const NAME = 'decided-app';
const PROPOSED = { phase: 'proposed', currentQuestion: null, invocation: 'idle', retries: 0 } as const;
const DECIDED = { ...PROPOSED, decision: { projectName: NAME } } as const;

beforeEach(() => {
  read.mockReset().mockResolvedValue('# proposal');
  promoteSessionToProject.mockClear();
  assertNameAvailable.mockReset().mockImplementation(async (_root, name) => `/share/${name}`);
  fetchMock.mockClear();
  readStateMock.mockReset().mockResolvedValue(DECIDED);
  writeStateMock.mockClear();
});

describe('recordDecision', () => {
  it('判断を記録する。ディレクトリは改名せず、phase は proposed のまま、起動は要求しない', async () => {
    const result = await recordDecision('/share', SESSION, PROPOSED as never, NAME);

    expect(result).toEqual({ ok: true });
    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock).toHaveBeenCalledWith(SESSION, { ...PROPOSED, decision: { projectName: NAME } });

    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('衝突は判断の時点で伝える。何も書かない', async () => {
    assertNameAvailable.mockRejectedValueOnce(Object.assign(new Error('既に存在する'), { statusCode: 409 }));

    await expect(recordDecision('/share', SESSION, PROPOSED as never, NAME)).rejects.toThrow('既に存在する');
    expect(assertNameAvailable).toHaveBeenCalledWith('/share', NAME);
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('既に判断が記録されていれば理由を返す。記録されている判断はそのまま', async () => {
    const result = await recordDecision('/share', SESSION, DECIDED as never, 'later');

    expect(result).toEqual({ ok: false, reason: 'already-decided' });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が残っていなければ理由を返す。名前の確認まで進まない', async () => {
    read.mockResolvedValueOnce(undefined);

    const result = await recordDecision('/share', SESSION, PROPOSED as never, NAME);

    expect(result).toEqual({ ok: false, reason: 'no-proposal' });
    expect(assertNameAvailable).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
  });
});

describe('withdrawDecision', () => {
  it('decision だけが消え、phase も他のフィールドも変わらない', async () => {
    const state = { ...DECIDED, retries: 1, projectName: 'candidate' };

    await withdrawDecision(SESSION, state as never);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    const [id, written] = writeStateMock.mock.calls[0]!;
    expect(id).toBe(SESSION);
    expect(written).toEqual({
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 1,
      projectName: 'candidate',
    });
    expect('decision' in written).toBe(false);
  });
});

describe('withdrawConflictedDecision', () => {
  it('同じ名前の判断だけを取り下げる', async () => {
    await withdrawConflictedDecision(SESSION, NAME);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect('decision' in writeStateMock.mock.calls[0]![1]).toBe(false);
  });

  it('別の名前へ下し直された判断は残す', async () => {
    readStateMock.mockResolvedValueOnce({ ...PROPOSED, decision: { projectName: 'another' } });

    await withdrawConflictedDecision(SESSION, NAME);

    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('判断が既に消えていれば何もしない', async () => {
    readStateMock.mockResolvedValueOnce(PROPOSED);

    await withdrawConflictedDecision(SESSION, NAME);

    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('昇格が済んでいれば何もしない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: NAME, invocation: 'idle' });

    await withdrawConflictedDecision(SESSION, NAME);

    expect(writeStateMock).not.toHaveBeenCalled();
  });
});
