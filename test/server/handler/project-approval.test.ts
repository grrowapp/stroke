import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 対象は `server/handler/project-approval.ts`（本家の承認依頼への応答の実処理）。
 *
 * 見るのは**本家へ送る値の組み立て**だけである。応答本文が空のときに action ごとの既定文を
 * 当てはめること、注釈を本家が受け取る1つの組へまとめること、注釈を持たない応答に空の組を
 * 付けないこと。
 *
 * 何を 400 で断るか（理由の無い却下・コメントの無い差し戻し・差し戻し以外の注釈）は
 * endpoint が持つので、ここには来ない。
 */

const { respondToApprovalUpstream } = vi.hoisted(() => ({ respondToApprovalUpstream: vi.fn() }));

vi.mock('../../../server/utils/control/upstream-proxy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../server/utils/control/upstream-proxy')>()),
  upstreamClient: () => ({ respondToApproval: respondToApprovalUpstream }),
}));

const { respondToApproval } = await import('../../../server/handler/project-approval');

const COMMENT = {
  id: 'c1',
  type: 'general' as const,
  comment: 'ここを直す',
  timestamp: '2026-09-09T00:00:00.000Z',
};

/** 本家へ渡された引数（projectId・approvalId・action・応答本文・注釈の組） */
function sentToUpstream(): unknown[] {
  return respondToApprovalUpstream.mock.calls[0]!;
}

describe('respondToApproval — 本家へ送る値の組み立て', () => {
  beforeEach(() => {
    respondToApprovalUpstream.mockReset().mockResolvedValue({ ok: true, value: null });
  });

  it('応答本文があればそのまま送る', async () => {
    await respondToApproval('PID1', 'A1', 'approve', { response: 'これでよい' });

    expect(sentToUpstream()).toEqual(['PID1', 'A1', 'approve', 'これでよい', undefined]);
  });

  it.each([
    ['approve', 'stroke-board から承認'],
    ['reject', 'stroke-board から却下'],
    ['needs-revision', 'stroke-board から差し戻し'],
  ] as const)('応答本文が無ければ %s の既定文を当てはめる', async (action, expected) => {
    await respondToApproval('PID1', 'A1', action, {});

    expect(sentToUpstream()[3]).toBe(expected);
  });

  it('応答本文が空文字でも既定文を当てはめる', async () => {
    await respondToApproval('PID1', 'A1', 'approve', { response: '' });

    expect(sentToUpstream()[3]).toBe('stroke-board から承認');
  });

  it('注釈は本家が受け取る1つの組にまとめる', async () => {
    await respondToApproval('PID1', 'A1', 'needs-revision', {
      response: '直してほしい',
      annotations: '<mark>ここ</mark>',
      comments: [COMMENT],
    });

    expect(sentToUpstream()[4]).toEqual({ annotations: '<mark>ここ</mark>', comments: [COMMENT] });
  });

  it('注釈の本体が無くてもコメントがあれば組を作る（本体は空文字で埋める）', async () => {
    await respondToApproval('PID1', 'A1', 'needs-revision', { comments: [COMMENT] });

    expect(sentToUpstream()[4]).toEqual({ annotations: '', comments: [COMMENT] });
  });

  it('コメントが無ければ組を付けない（空の注釈欄を本家に残さない）', async () => {
    await respondToApproval('PID1', 'A1', 'reject', { response: '受け付けない' });

    expect(sentToUpstream()[4]).toBeUndefined();
  });

  it('本家の結果はそのまま返す（HTTP へ写すのは endpoint）', async () => {
    respondToApprovalUpstream.mockResolvedValue({ ok: false, failure: { kind: 'not-configured' } });

    await expect(respondToApproval('PID1', 'A1', 'approve', {})).resolves.toEqual({
      ok: false,
      failure: { kind: 'not-configured' },
    });
  });
});
