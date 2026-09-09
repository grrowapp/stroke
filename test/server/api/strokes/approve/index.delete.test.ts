import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/approve/index.delete.ts`（U10 の取り消し）。位置の付け方は
 * `question/index.post.test.ts` と同じ。
 *
 * 取り消すのは判断だけである（openspec/specs/api/session/approve「記録した判断は、昇格の
 * 前なら取り消せる」）。proposal・ストロークの往復の記録・ディレクトリの中身には触れない。
 */

const { write, revertPromotion } = vi.hoisted(() => ({
  write: vi.fn(async () => undefined),
  revertPromotion: vi.fn(async () => undefined),
}));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

// 定数（`PROJECT_DOCS_DIR` など）は session-store が引くので本物を残し、動作だけ差し替える
vi.mock('../../../../../server/utils/stroke/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/project')>()),
  revertPromotion,
  promoteSessionToProject: vi.fn(async () => '/share/x'),
  assertNameAvailable: vi.fn(async () => '/share/x'),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => DECIDED),
    writeState: vi.fn(async () => undefined),
    writeStrokes: vi.fn(async () => undefined),
    appendStroke: vi.fn(async () => undefined),
    sessionProposal: vi.fn(() => ({ read: async () => '# proposal', write })),
  };
});

stubNitroGlobals();

const { default: cancelHandler } = await import('../../../../../server/api/strokes/[id]/approve/index.delete');
const { appendStroke, readState, sessionExists, writeState } = await import(
  '../../../../../server/utils/stroke/session-store'
);

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  retries: 1,
  projectName: 'candidate',
  decision: { projectName: 'decided-app' },
} as const;

describe('DELETE /api/strokes/:id/approve', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    writeStateMock.mockClear();
    sessionExistsMock.mockReset().mockResolvedValue(true);
    write.mockClear();
    revertPromotion.mockClear();
  });

  it('判断を取り下げて 204。decision だけが消え、phase も他のフィールドも変わらない', async () => {
    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
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

  it('proposal・往復の記録・ディレクトリの中身には触れない', async () => {
    await cancelHandler(fakeEvent(SESSION, undefined) as never);

    // proposal を書かない・strokes を足さない・改名の巻き戻しも呼ばない（動かしていないので）
    expect(write).not.toHaveBeenCalled();
    expect(vi.mocked(appendStroke)).not.toHaveBeenCalled();
    expect(revertPromotion).not.toHaveBeenCalled();
    // 書くのは state.json だけで、それも1回
    expect(writeStateMock).toHaveBeenCalledTimes(1);
  });

  it('昇格が済んだ対象への取り消しは受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(cancelHandler(fakeEvent('made', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('昇格した後は取り消せない'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('完成した（activated）対象への取り消しも受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(cancelHandler(fakeEvent('made', undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('昇格した後は取り消せない'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('判断が無いセッションへの取り消しは何も変えない（204）', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が出る前（stroking）も何も変えない（204）', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    const response = await cancelHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('存在しない id への取り消しは 404', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(cancelHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });
});
