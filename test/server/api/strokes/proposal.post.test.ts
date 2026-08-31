import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeEvent, stubNitroGlobals, type FakeEvent } from '../support';

/**
 * 対象は `server/api/strokes/[id]/proposal.post.ts`（A7）。位置の付け方は
 * `question.post.test.ts` と同じ（`[id]` の段を挟まない理由もそちらに書いてある）。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { write } = vi.hoisted(() => ({ write: vi.fn(async () => undefined) }));

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
  markProposalStrokeIfFirst: vi.fn(async () => undefined),
  sessionProposal: vi.fn(() => ({ write })),
}));

stubNitroGlobals();

const { default: proposalHandler } = await import('../../../../server/api/strokes/[id]/proposal.post');
const { readState, writeState } = await import('../../../../server/utils/stroke/session-store');

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

  it('承認済みのセッションには 409 を返し、本文を残さない', async () => {
    readStateMock.mockResolvedValueOnce({ phase: 'approved', projectName: 'example', invocation: 'idle' });
    const event = fakeEvent('session-1', BODY);

    await expect(proposalHandler(event as never)).rejects.toThrow('承認済みのセッションには提出できない。');
    expect(write).not.toHaveBeenCalled();
    expect(event.status).toBeUndefined();
  });
});
