import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../support';

/**
 * 対象は `server/api/strokes/[id]/question.post.ts`（A5）。テストの位置はソースの構造を
 * 写すが、`[id]` の段は挟まない——vitest の `include` は glob で、`[id]` は「i か d の
 * 1文字」を表す文字クラスとして解釈される。そこに置いたテストは1本も拾われない。
 */

// ステータスの観測点。理由は `../support.ts` の `stubNitroGlobals` に書いてある
vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../server/utils/stroke/session-store', () => ({
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => ({ phase: 'stroking', currentQuestion: null, invocation: 'idle' })),
  writeState: vi.fn(async () => undefined),
}));

stubNitroGlobals();

const { default: questionHandler } = await import('../../../../server/api/strokes/[id]/question.post');
const { readState, writeState } = await import('../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);

const QUESTION = {
  header: '保存方式',
  detail: 'どこに置くかまでは決まったが、形式が未確定である。',
  question: '保存方式をどうするか',
  options: [{ label: 'JSON', description: '1ファイルに丸ごと持つ' }],
};

describe('A5 POST /api/strokes/:id/question', () => {
  beforeEach(() => {
    readStateMock.mockClear();
    writeStateMock.mockClear();
  });

  /**
   * 受理と記録で完結する操作は本文を持たない 204 を返す
   * （`docs/specs/api/contract.md` A5「output: 本文なし（204）」）。
   *
   * **食い違いはソースの側にしか出ない。** ここを 200 と書いても、本文なし（`return null`）の
   * 応答は h3 の `sendNoContent` を通り、200 は既定の 204 に落ちて線の上では 204 になる
   * （`node_modules/h3/dist/index.mjs` の `sendNoContent` / `sanitizeStatusCode`）。
   * 出ないぶん、読んだ側が揃って 200 だと思い込む——代行する MCP ツールの注釈も、その
   * テストの期待値も、長く 200 を書いていた。ここで留めるのはソースが述べるステータスである。
   */
  it('受理したら本文なしの 204 を返す', async () => {
    const event = fakeEvent('session-1', QUESTION);

    const body = await questionHandler(event as never);

    // ハンドラは status を自分で持った Response を返す（`setResponseStatus` + 裸の null は
    // h3 に捨てられる）。観測点は event ではなく返り値である
    expect(body).toBeInstanceOf(Response);
    expect((body as Response).status).toBe(204);
    expect(await (body as Response).text()).toBe('');
  });

  it('受理した問いを state へ残す', async () => {
    const event = fakeEvent('session-1', QUESTION);

    await questionHandler(event as never);

    expect(writeStateMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ currentQuestion: expect.objectContaining({ question: '保存方式をどうするか' }) }),
    );
  });

  it('読み取れない問いは 400 で弾き、state を書かない', async () => {
    const event = fakeEvent('session-1', { ...QUESTION, options: [] });

    await expect(questionHandler(event as never)).rejects.toThrow('問いの構造として読み取れない。');
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });

  it('承認済みのセッションには 409 を返し、state を書かない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', QUESTION);

    await expect(questionHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(writeStateMock).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });
});
