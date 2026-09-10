import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/settlement.ts`（実行の決着の振り分け）。
 *
 * **局面が動くのはここから先だけである**（change fix-rename-during-running-session）。提出を
 * 受ける口（A5・A7）は記録だけを行い、phase の切り替えと配信は決着が持つ。局面が変わってよい
 * のは実行が終わった時点だけで、それを知るのは子プロセスを制御する invoke-agent だけである
 * （openspec/specs/agent/invocation）。
 *
 * 見るのは**振り分けだけ**である——`submitted` でどちらを呼ぶか、断りをそのまま返すか。
 * 何を書いて何を流すかは `test/server/handler/{question,proposal}.test.ts`、受け付けてよい
 * 局面かは `test/server/api/strokes/settlement/index.post.test.ts`。
 */

// `vi.mock` は import より上へ巻き上げられるので、その中から触るものは `vi.hoisted` に置く
const { settleQuestion, settleProposal } = vi.hoisted(() => ({
  settleQuestion: vi.fn(async () => undefined),
  settleProposal: vi.fn(async () => true),
}));

vi.mock('../../../server/handler/question', () => ({ settleQuestion }));
vi.mock('../../../server/handler/proposal', () => ({ settleProposal }));

const { settle } = await import('../../../server/handler/settlement');

const STROKING = { phase: 'stroking', currentQuestion: null, invocation: 'idle' } as const;

describe('settle', () => {
  beforeEach(() => {
    settleQuestion.mockClear().mockResolvedValue(undefined);
    settleProposal.mockClear().mockResolvedValue(true);
  });

  /** 問いは画面へ配信するだけで、phase を進めない */
  it('question の決着は settleQuestion だけを呼び、true を返す', async () => {
    await expect(settle('session-1', STROKING, 'question')).resolves.toBe(true);

    expect(settleQuestion).toHaveBeenCalledWith('session-1', STROKING);
    expect(settleProposal).not.toHaveBeenCalled();
  });

  /** proposal は phase を `proposed` にしてから配信する */
  it('proposal の決着は settleProposal だけを呼び、その結果を返す', async () => {
    await expect(settle('session-1', STROKING, 'proposal')).resolves.toBe(true);

    expect(settleProposal).toHaveBeenCalledWith('session-1', STROKING);
    expect(settleQuestion).not.toHaveBeenCalled();
  });

  /**
   * 断りは握りつぶさずにそのまま返す（ADR-0022）。呼び手（A9）が 409 phase に写す。
   */
  it('settleProposal が断ったら false をそのまま返す', async () => {
    settleProposal.mockResolvedValueOnce(false);

    await expect(settle('session-1', STROKING, 'proposal')).resolves.toBe(false);
  });

  it('決着の失敗はそのまま投げる', async () => {
    settleProposal.mockRejectedValueOnce(new Error('書けない'));

    await expect(settle('session-1', STROKING, 'proposal')).rejects.toThrow('書けない');
  });
});
