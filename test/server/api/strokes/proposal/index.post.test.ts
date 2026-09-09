import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/proposal/index.post.ts`（A7）。位置の付け方は
 * `question/index.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { write } = vi.hoisted(() => ({ write: vi.fn(async () => undefined) }));

// ステータスの観測点。理由は `../../support.ts` の `stubNitroGlobals` に書いてある
vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => ({ phase: 'stroking', currentQuestion: null, invocation: 'idle' })),
  writeState: vi.fn(async () => undefined),
  markProposalStrokeIfFirst: vi.fn(async () => undefined),
  sessionProposal: vi.fn(() => ({ write })),
}));

stubNitroGlobals();

const { default: proposalHandler } = await import('../../../../../server/api/strokes/[id]/proposal/index.post');
const { readState, writeState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);
const writeStateMock = vi.mocked(writeState);

const BODY = { proposal: '# 提案\n\n本文。', projectName: 'example-project' };

describe('A7 POST /api/strokes/:id/proposal', () => {
  beforeEach(() => {
    write.mockClear();
    readStateMock.mockClear();
    writeStateMock.mockClear();
  });

  /**
   * A5 と同じ契約（`docs/specs/api/contract.md` A7「output: 本文なし（204）」）。
   * 代行する MCP ツール（`server/mcp/tools/submit-document.ts` の flontier）は
   * この `status` を素通しする。
   */
  it('受理したら本文なしの 204 を返す', async () => {
    const event = fakeEvent('session-1', BODY);

    const body = await proposalHandler(event as never);

    // ハンドラは status を自分で持った Response を返す（`setResponseStatus` + 裸の null は
    // h3 に捨てられる）。観測点は event ではなく返り値である
    expect(body).toBeInstanceOf(Response);
    expect((body as Response).status).toBe(204);
    expect(await (body as Response).text()).toBe('');
  });

  it('受理した本文を残してから phase を進める', async () => {
    const event = fakeEvent('session-1', BODY);

    await proposalHandler(event as never);

    expect(write).toHaveBeenCalledWith('# 提案\n\n本文。');
    expect(writeStateMock).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ phase: 'proposed', projectName: 'example-project' }),
    );
  });

  /**
   * 判断はそれが下された proposal に結びつく（openspec/specs/api/session/approve）。出し直しで
   * 失効させるのは proposal を書く口がここ1つだからで（design.md 決定2）、口が増えたら
   * ここが落ちるのではなく漏れる——増やすときはこのテストの相方を足すこと。
   */
  it('出し直すと記録されていた承認の判断は失効する', async () => {
    readStateMock.mockResolvedValueOnce({
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 1,
      decision: { projectName: 'decided-on-old-proposal' },
    });

    await proposalHandler(fakeEvent('session-1', BODY) as never);

    expect(writeStateMock).toHaveBeenCalledTimes(1);
    const [, written] = writeStateMock.mock.calls[0]!;
    expect(written).toEqual({
      phase: 'proposed',
      currentQuestion: null,
      invocation: 'idle',
      retries: 1,
      projectName: 'example-project',
    });
    expect('decision' in written).toBe(false);
    // 失効は出し直しそのものを妨げない
    expect(write).toHaveBeenCalledWith('# 提案\n\n本文。');
  });

  it('承認済みのセッションには 409 を返し、本文を残さない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', BODY);

    await expect(proposalHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(write).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });

  it('完成した（activated）プロジェクトにも 409 を返し、本文を残さない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', BODY);

    await expect(proposalHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(write).not.toHaveBeenCalled();
  });
});
