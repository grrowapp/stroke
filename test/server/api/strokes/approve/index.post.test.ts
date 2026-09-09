import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/approve/index.post.ts`（U10）。位置の付け方は
 * `question/index.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 *
 * U10 は承認の判断を記録するだけである（openspec/specs/api/session/approve）。ここで
 * 固定するのは「承認を受けても**ディレクトリの名前が変わらない**・`phase` が `proposed` の
 * まま・起動が要求されない」こと。昇格は U14（`promote/index.post.test.ts`）が持つ。
 */

const { read, promoteSessionToProject, assertNameAvailable, fetchMock } = vi.hoisted(() => ({
  read: vi.fn(async (): Promise<string | undefined> => '# proposal'),
  promoteSessionToProject: vi.fn(async () => '/share/decided-app'),
  assertNameAvailable: vi.fn(async (_root: string, name: string) => `/share/${name}`),
  fetchMock: vi.fn(async () => undefined),
}));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: '/share' }),
}));

// 定数（`PROJECT_DOCS_DIR` など）は session-store が引くので本物を残し、動作だけ差し替える
vi.mock('../../../../../server/utils/stroke/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/project')>()),
  assertNameAvailable,
  promoteSessionToProject,
  revertPromotion: vi.fn(async () => undefined),
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => PROPOSED),
    writeState: vi.fn(async () => undefined),
    sessionProposal: vi.fn(() => ({ read })),
  };
});

stubNitroGlobals();
// 起動の要求（U13）が出ていないことの観測点。U10 は $fetch を一切呼ばない
vi.stubGlobal('$fetch', fetchMock);

const { default: approveHandler } = await import('../../../../../server/api/strokes/[id]/approve/index.post');
const { readState, sessionExists, writeState } = await import(
  '../../../../../server/utils/stroke/session-store'
);

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const PROPOSED = { phase: 'proposed', currentQuestion: null, invocation: 'idle', retries: 0 } as const;
const BODY = { projectName: 'decided-app' };

describe('U10 POST /api/strokes/:id/approve', () => {
  beforeEach(() => {
    read.mockReset().mockResolvedValue('# proposal');
    promoteSessionToProject.mockClear();
    assertNameAvailable.mockReset().mockImplementation(async (_root, name) => `/share/${name}`);
    fetchMock.mockClear();
    readStateMock.mockReset().mockResolvedValue(PROPOSED);
    writeStateMock.mockClear();
    sessionExistsMock.mockReset().mockResolvedValue(true);
  });

  it('判断を記録して 204。ディレクトリは改名せず、phase は proposed のまま、起動は要求しない', async () => {
    const response = await approveHandler(fakeEvent(SESSION, BODY) as never);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(204);

    // 判断は `proposed` の中に書かれる
    expect(writeStateMock).toHaveBeenCalledTimes(1);
    expect(writeStateMock).toHaveBeenCalledWith(SESSION, {
      ...PROPOSED,
      decision: { projectName: 'decided-app' },
    });

    // 改名しない・起動しない
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('衝突は判断の時点で伝える。何も書かない', async () => {
    assertNameAvailable.mockRejectedValueOnce(Object.assign(new Error('既に存在する'), { statusCode: 409 }));

    await expect(approveHandler(fakeEvent(SESSION, BODY) as never)).rejects.toThrow('既に存在する');
    expect(assertNameAvailable).toHaveBeenCalledWith('/share', 'decided-app');
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('既に判断が記録されていれば受理しない。記録されている判断はそのまま', async () => {
    readStateMock.mockResolvedValueOnce({ ...PROPOSED, decision: { projectName: 'earlier' } });

    await expect(approveHandler(fakeEvent(SESSION, { projectName: 'later' }) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('既に記録されている'),
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が残っていなければ受理しない', async () => {
    read.mockResolvedValueOnce(undefined);

    await expect(approveHandler(fakeEvent(SESSION, BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: '承認する proposal が見つからない。',
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('昇格した後に承認が届いても受理せず、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'made', invocation: 'idle' });

    await expect(approveHandler(fakeEvent('made', BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に承認済み。',
    });
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });

  it('完成した（activated）後も同じく受理せず、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'made', invocation: 'idle' });

    await expect(approveHandler(fakeEvent('made', BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に承認済み。',
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が出ていない局面（stroking）では受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(approveHandler(fakeEvent(SESSION, BODY) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: '承認できるのは proposal が出ているときだけ。',
    });
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('存在しない id への承認は 404 で、何も変えない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(approveHandler(fakeEvent('missing', BODY) as never)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(readStateMock).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('本文にプロジェクト名が無ければ 400', async () => {
    await expect(approveHandler(fakeEvent(SESSION, {}) as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(writeStateMock).not.toHaveBeenCalled();
  });
});
