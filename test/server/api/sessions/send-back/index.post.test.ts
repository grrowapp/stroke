import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/sessions/[id]/send-back/index.post.ts`（U9）。位置の付け方は
 * `test/server/api/strokes/question/index.post.test.ts` と同じ。
 *
 * ここで固定するのは1点——**差し戻しを送っても承認の判断は失効しない**こと。判断が失効するのは
 * proposal が出し直された時点（A7・`test/server/api/strokes/proposal/index.post.test.ts`）であって、差し戻しを送った時点では
 * ない（openspec/specs/api/session/approve「判断は、それが下された proposal に結びつく」）。
 * AI が応答を返さずに終わったときは、判断は残ったままでよい。
 */

vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/session-store', () => ({
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => DECIDED),
  writeState: vi.fn(async () => undefined),
  writeSendBack: vi.fn(async () => undefined),
}));

stubNitroGlobals();

const { default: sendBackHandler } = await import('../../../../../server/api/sessions/[id]/send-back/index.post');
const { readState, writeSendBack, writeState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);
const writeSendBackMock = vi.mocked(writeSendBack);

const DECIDED = {
  phase: 'proposed',
  currentQuestion: null,
  invocation: 'idle',
  decision: { projectName: 'decided-app' },
} as const;

const PAYLOAD = {
  response: '直してほしい',
  comments: [{ id: 'c1', type: 'general', comment: '全体的に薄い', timestamp: '2026-09-01T00:00:00Z' }],
  annotations: '{}',
  nextSteps: [],
};

describe('U9 POST /api/sessions/:id/send-back', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(DECIDED);
    writeStateMock.mockClear();
    writeSendBackMock.mockClear();
  });

  it('判断が記録されていても受理し、判断には触れない', async () => {
    const response = await sendBackHandler(fakeEvent('session-1', PAYLOAD) as never);

    expect((response as Response).status).toBe(204);
    expect(writeSendBackMock).toHaveBeenCalledTimes(1);
    // state.json は書かない = `decision` はそのまま残る
    expect(writeStateMock).not.toHaveBeenCalled();
  });

  it('proposal が出ていなければ受理しない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'stroking', currentQuestion: null, invocation: 'idle' });

    await expect(sendBackHandler(fakeEvent('session-1', PAYLOAD) as never)).rejects.toMatchObject({ statusCode: 409 });
    expect(writeSendBackMock).not.toHaveBeenCalled();
  });
});
