import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../../support';

/**
 * 対象は `server/api/strokes/[id]/proposal/index.post.ts`（A7）。位置の付け方は
 * `question/index.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 *
 * **見るのは準備と後始末だけである**——承認以降の 409、通ったときに handler へ渡すものと
 * 204 の返し方。受理の順序（残す → phase を進める → 配信する）・出し直しでの判断の失効・
 * 候補名の採り方は `test/server/handler/proposal.test.ts`。
 */

const { submitProposal } = vi.hoisted(() => ({ submitProposal: vi.fn(async () => undefined) }));

vi.mock('../../../../../server/handler/proposal', () => ({ submitProposal }));

// ステータスの観測点。理由は `../../support.ts` の `stubNitroGlobals` に書いてある
vi.mock('#app/composables/ssr', () => ({
  setResponseStatus: (event: FakeEvent, status: number) => {
    event.status = status;
  },
}));

vi.mock('../../../../../server/utils/stroke/session-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../server/utils/stroke/session-store')>()),
  sessionExists: vi.fn(async () => true),
  readState: vi.fn(async () => STROKING),
}));

stubNitroGlobals();

const { default: proposalHandler } = await import('../../../../../server/api/strokes/[id]/proposal/index.post');
const { readState } = await import('../../../../../server/utils/stroke/session-store');

const readStateMock = vi.mocked(readState);

const BODY = { proposal: '# 提案\n\n本文。', projectName: 'example-project' };
const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

describe('A7 POST /api/strokes/:id/proposal', () => {
  beforeEach(() => {
    readStateMock.mockReset().mockResolvedValue(STROKING);
    submitProposal.mockClear();
  });

  /**
   * A5 と同じ契約（`docs/specs/api/contract.md` A7「output: 本文なし（204）」）。
   * 代行する MCP ツール（`server/mcp/tools/submit-document.ts` の flontier）は
   * この `status` を素通しする。
   */
  it('受理したら handler へ渡し、本文なしの 204 を返す', async () => {
    const event = fakeEvent('session-1', BODY);

    const body = await proposalHandler(event as never);

    // 候補名は検証を通さずそのまま渡す——kebab-case かを見て採否を決めるのは handler である
    expect(submitProposal).toHaveBeenCalledWith('session-1', STROKING, '# 提案\n\n本文。', 'example-project');
    // ハンドラは status を自分で持った Response を返す（`setResponseStatus` + 裸の null は
    // h3 に捨てられる）。観測点は event ではなく返り値である
    expect(body).toBeInstanceOf(Response);
    expect((body as Response).status).toBe(204);
    expect(await (body as Response).text()).toBe('');
  });

  it('候補名が無い本文も受理し、handler へは undefined を渡す', async () => {
    await proposalHandler(fakeEvent('session-1', { proposal: '# 提案\n\n本文。' }) as never);

    expect(submitProposal).toHaveBeenCalledWith('session-1', STROKING, '# 提案\n\n本文。', undefined);
  });

  it('承認済みのセッションには 409 を返し、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', BODY);

    await expect(proposalHandler(event as never)).rejects.toMatchObject({
      statusCode: 409,
      data: { reason: 'phase' },
      message: expect.stringContaining('承認済みのセッションには提出できない。'),
    });
    expect(submitProposal).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });

  it('完成した（activated）プロジェクトにも 409 を返し、handler を呼ばない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'activated', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', BODY);

    await expect(proposalHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(submitProposal).not.toHaveBeenCalled();
  });
});
