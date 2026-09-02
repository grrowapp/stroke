import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldRetry } from '../../../../server/utils/stroke/sweep';
import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../support';

/**
 * 対象は `server/api/strokes/[id]/promote.post.ts`（U14）。位置の付け方は
 * `question.post.test.ts` と同じ。
 *
 * 昇格の段（openspec/specs/api/session/promote）。判断が無ければ受理せず、順序は
 * 「衝突確認 → 改名 → `phase` を書く」のまま、失敗したら改名を戻して**判断は残す**。
 * 起動は要求せず、`invocation` を A8 経由で `failed` にして巡回へ引き渡す。
 *
 * **busy ガードは U10 からここへ移した**（fix-rename-during-running-session）。改名する
 * のはこの段なので、対象になるのもここである。`running.ts` の実物は
 * `test/server/utils/stroke/running.test.ts` が見ているので、ここでは `beginRun` /
 * `endRun` をモックし、呼ばれ方（どのパスで占有するか・断られたら何も変えないか・解放が
 * どこで起きるか）だけを見る。
 */

const { assertNameAvailable, promoteSessionToProject, revertPromotion, broadcastProjectCreation, forgetSubmissions, fetchMock, beginRun, endRun } =
  vi.hoisted(() => ({
    assertNameAvailable: vi.fn(async (_root: string, name: string) => `/share/${name}`),
    promoteSessionToProject: vi.fn(async (_root: string, _id: string, name: string) => `/share/${name}`),
    revertPromotion: vi.fn(async () => undefined),
    broadcastProjectCreation: vi.fn(() => undefined),
    forgetSubmissions: vi.fn(() => undefined),
    fetchMock: vi.fn(async (..._args: unknown[]) => undefined),
    beginRun: vi.fn(async (path: string) => `key:${path}`),
    endRun: vi.fn(),
  }));

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../server/utils/stroke/config', () => ({
  readStrokeConfig: () => ({ projectShareRoot: '/share' }),
}));

// 定数（`PROJECT_DOCS_DIR` など）は session-store が引くので本物を残し、動作だけ差し替える
vi.mock('../../../../server/utils/stroke/project', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../server/utils/stroke/project')>()),
  assertNameAvailable,
  promoteSessionToProject,
  revertPromotion,
}));

vi.mock('../../../../server/utils/control/board', () => ({
  broadcastProjectCreation,
}));

vi.mock('../../../../server/utils/stroke/submission-signal', () => ({
  forgetSubmissions,
  notifySubmission: vi.fn(),
  submissionCount: vi.fn(() => 0),
}));

// `sessionRunPath` / `projectRunPath` は fs を引かない純粋関数なので本物を残し、
// `beginRun` / `endRun` だけ差し替える
vi.mock('../../../../server/utils/stroke/running', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../server/utils/stroke/running')>()),
  beginRun,
  endRun,
}));

vi.mock('../../../../server/utils/stroke/session-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/utils/stroke/session-store')>();
  return {
    ...actual,
    sessionExists: vi.fn(async () => true),
    readState: vi.fn(async () => DECIDED),
    writeState: vi.fn(async () => undefined),
  };
});

stubNitroGlobals();
// A8 への内部 $fetch の観測点。U13（invoke-agent）が呼ばれないことも同じ口で見る
vi.stubGlobal('$fetch', fetchMock);

const { default: promoteHandler } = await import('../../../../server/api/strokes/[id]/promote.post');
const { readState, sessionExists, writeState } = await import(
  '../../../../server/utils/stroke/session-store'
);
const { invokePath } = await import('../../../../server/utils/stroke/invoke');
const { submissionPath } = await import('../../../../server/utils/stroke/submission-path');
const { sessionRunPath } = await import('../../../../server/utils/stroke/running');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const sessionExistsMock = vi.mocked(sessionExists);

const SESSION = '0d0c8a1e-1111-4222-8333-444444444444';
const NAME = 'decided-app';
const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  retries: 0,
  decision: { projectName: NAME },
} as const;

/** $fetch に渡された path の一覧 */
function fetchedPaths(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe('U14 POST /api/strokes/:id/promote', () => {
  beforeEach(() => {
    assertNameAvailable.mockReset().mockImplementation(async (_root, name) => `/share/${name}`);
    promoteSessionToProject.mockReset().mockImplementation(async (_root, _id, name) => `/share/${name}`);
    revertPromotion.mockClear();
    broadcastProjectCreation.mockClear();
    forgetSubmissions.mockClear();
    fetchMock.mockReset().mockResolvedValue(undefined);
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    writeStateMock.mockReset().mockResolvedValue(undefined);
    sessionExistsMock.mockReset().mockResolvedValue(true);
    beginRun.mockReset().mockImplementation(async (path: string) => `key:${path}`);
    endRun.mockReset();
  });

  it('判断の名前で「占有 → 衝突確認 → 改名 → phase を書く → 解放」の順に昇格し、204 を返す', async () => {
    const order: string[] = [];
    beginRun.mockImplementation(async (path: string) => {
      order.push('begin');
      return `key:${path}`;
    });
    assertNameAvailable.mockImplementation(async (_root, name) => {
      order.push('assert');
      return `/share/${name}`;
    });
    promoteSessionToProject.mockImplementation(async (_root, _id, name) => {
      order.push('rename');
      return `/share/${name}`;
    });
    writeStateMock.mockImplementation(async () => {
      order.push('write');
    });
    endRun.mockImplementation(() => {
      order.push('end');
    });

    const response = await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(order).toEqual(['begin', 'assert', 'rename', 'write', 'end']);
    // 名前は本文からではなく判断から引く
    expect(assertNameAvailable).toHaveBeenCalledWith('/share', NAME);
    expect(promoteSessionToProject).toHaveBeenCalledWith('/share', SESSION, NAME);
    // `approved` は改名後の場所へ、`invocation` の初期値つきで書く
    expect(writeStateMock).toHaveBeenCalledWith(NAME, {
      phase: 'approved',
      projectName: NAME,
      invocation: 'idle',
      retries: 0,
    });
    expect(revertPromotion).not.toHaveBeenCalled();
  });

  it('本文の名前は使わない。判断と違う名前を送っても判断の名前で昇格する', async () => {
    await promoteHandler(fakeEvent(SESSION, { projectName: 'somebody-else' }) as never);

    expect(promoteSessionToProject).toHaveBeenCalledWith('/share', SESSION, NAME);
  });

  it('昇格した瞬間に生成中を配信し、旧 id の提出の記録を落とす', async () => {
    await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect(broadcastProjectCreation).toHaveBeenCalledWith(NAME, 'in-progress');
    expect(forgetSubmissions).toHaveBeenCalledWith(SESSION);
  });

  it('起動は要求しない。invoke-agent を叩かない', async () => {
    await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect(fetchedPaths().some((path) => path.includes('/invoke-agent'))).toBe(false);
    expect(fetchedPaths()).not.toContain(invokePath(NAME, `/share/${NAME}`));
  });

  it('昇格の完了時点で invocation を failed にする。A8 を通し、writeState では書かない', async () => {
    await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect(fetchMock).toHaveBeenCalledWith(submissionPath(NAME), {
      method: 'POST',
      body: { invocation: 'failed' },
    });
    // `writeState` が書いた `invocation` は初期値の `idle` だけ。`failed` は A8 の仕事
    for (const [, state] of writeStateMock.mock.calls) {
      expect(state.invocation).toBe('idle');
    }
    // 巡回が拾う値である（起動の段を巡回へ引き渡す）
    expect(shouldRetry('failed')).toBe(true);
  });

  it('A8 の呼び出しを待ち切ってから応答を返す', async () => {
    let settle: () => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          settle = () => resolve(undefined);
        }),
    );

    let settled = false;
    const pending = promoteHandler(fakeEvent(SESSION, undefined) as never).then((response) => {
      settled = true;
      return response;
    });

    // A8 を叩いたのに、その応答が返るまでは昇格の応答も返らない
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(submissionPath(NAME), expect.anything()));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);

    settle();
    expect(((await pending) as Response).status).toBe(204);
  });

  it('A8 が失敗しても昇格は巻き戻さず、204 を返す', async () => {
    fetchMock.mockRejectedValueOnce(new Error('A8 down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    expect(revertPromotion).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('phase の書き込みに失敗したら改名を戻し、判断には触れない', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toThrow('disk full');

    expect(revertPromotion).toHaveBeenCalledWith('/share', NAME, SESSION);
    // セッション側の state.json は書き換えない = 判断はそのまま残る
    expect(writeStateMock.mock.calls.some(([id]) => id === SESSION)).toBe(false);
    // 配信も引き渡しも起きない
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('改名に失敗したら phase を書かず、判断には触れない。同じ判断のままやり直せる', async () => {
    promoteSessionToProject.mockRejectedValueOnce(Object.assign(new Error('rename failed'), { statusCode: 500 }));

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toThrow('rename failed');
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(revertPromotion).not.toHaveBeenCalled();

    // 同じ判断で2回目。今度は通る
    const response = await promoteHandler(fakeEvent(SESSION, undefined) as never);
    expect((response as Response).status).toBe(204);
    expect(promoteSessionToProject).toHaveBeenLastCalledWith('/share', SESSION, NAME);
  });

  it('判断が無ければ受理せず、改名は起こらない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'proposed', currentQuestion: null, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('判断が記録されていない'),
    });
    expect(assertNameAvailable).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が出る前（stroking）は判断を持ちえないので受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({ statusCode: 409 });
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });

  it('既に昇格した対象への重ねての昇格は受理せず、何も変えない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: NAME, invocation: 'idle' });

    await expect(promoteHandler(fakeEvent(NAME, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      message: 'このセッションは既に昇格している。',
    });
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('存在しない id への昇格は 404 で、何も変えない', async () => {
    sessionExistsMock.mockResolvedValueOnce(false);

    await expect(promoteHandler(fakeEvent('missing', undefined) as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(readStateMock).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
  });

  it('衝突は改名の前に弾く。判断はそのまま残る', async () => {
    assertNameAvailable.mockRejectedValueOnce(Object.assign(new Error('既に存在する'), { statusCode: 409 }));

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toThrow('既に存在する');
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
  });
});

describe('U14 POST /api/strokes/:id/promote — busy ガード（U10 から移した。fix-rename-during-running-session）', () => {
  beforeEach(() => {
    assertNameAvailable.mockReset().mockImplementation(async (_root, name) => `/share/${name}`);
    promoteSessionToProject.mockReset().mockImplementation(async (_root, _id, name) => `/share/${name}`);
    revertPromotion.mockClear();
    broadcastProjectCreation.mockClear();
    forgetSubmissions.mockClear();
    fetchMock.mockReset().mockResolvedValue(undefined);
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    writeStateMock.mockReset().mockResolvedValue(undefined);
    sessionExistsMock.mockReset().mockResolvedValue(true);
    beginRun.mockReset().mockImplementation(async (path: string) => `key:${path}`);
    endRun.mockReset();
  });

  it('対象の作業場所（セッション id・改名前の実体）を beginRun で占有する', async () => {
    await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect(beginRun).toHaveBeenCalledWith(sessionRunPath('/share', SESSION));
  });

  it('実行中は 409 busy を返し、何も変わらない（改名・phase 書き込み・配信・A8 のいずれも起きない）', async () => {
    beginRun.mockRejectedValueOnce(
      Object.assign(new Error('この作業場所は AI の応答を待っている。'), {
        statusCode: 409,
        data: { reason: 'busy' },
      }),
    );

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'busy' },
    });

    expect(assertNameAvailable).not.toHaveBeenCalled();
    expect(promoteSessionToProject).not.toHaveBeenCalled();
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(broadcastProjectCreation).not.toHaveBeenCalled();
    expect(forgetSubmissions).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('busy で断ったときは占有を残さない。beginRun が失敗しているので endRun は呼ばれない', async () => {
    beginRun.mockRejectedValueOnce(Object.assign(new Error('busy'), { statusCode: 409, data: { reason: 'busy' } }));

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toMatchObject({ statusCode: 409 });

    // 占有を取れていない（beginRun が一度も返っていない）ので、解放も起きようがない
    expect(endRun).not.toHaveBeenCalled();
  });

  it('占有は改名・phase 書き込みの直後、steering の起動（U13）を叩く前に解放される', async () => {
    const response = await promoteHandler(fakeEvent(SESSION, undefined) as never);

    expect((response as Response).status).toBe(204);
    // beginRun が返したキーで解放する
    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
    // 解放後の対象へ、以後の呼び出し（= 呼び手が直後に叩く U13 の beginRun）が
    // 同じキーで占有できる状態になっている
    expect(endRun).toHaveBeenCalledTimes(1);
  });

  it('phase の書き込みに失敗して改名を戻しても、占有は解放される', async () => {
    writeStateMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(promoteHandler(fakeEvent(SESSION, undefined) as never)).rejects.toThrow('disk full');

    expect(endRun).toHaveBeenCalledWith(`key:${sessionRunPath('/share', SESSION)}`);
  });
});
