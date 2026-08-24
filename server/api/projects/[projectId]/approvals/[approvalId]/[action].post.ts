/**
 * 承認への応答。ブラウザ → Nitro → 本家 と中継する。
 *
 * stroke-board が `.spec-workflow/` へ直接書くことはない。書くのは本家で、こちらは
 * 本家の `POST /api/projects/:projectId/approvals/:id/:action` を呼ぶだけである
 * （ADR-0005 の「二重に書き込む主体を作らない」はこの形で保つ）。
 *
 * ここが stroke-board で唯一の書き込み経路になる。増やすときは接点層の口も増やす
 * 必要があるので、意図しない書き込みが紛れ込むことはない。
 */

import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { z } from 'zod';

import { APPROVAL_ACTIONS, type ApprovalAction } from '../../../../../utils/upstream/rest';
import { toHttpError, upstreamClient } from '../../../../../utils/control/upstream-proxy';

/**
 * 本家は body の `response` を応答本文として保存する。
 * 却下は理由が要るので空を通さない。承認は既定文を使うので省略できる。
 */
const bodySchema = z.object({
  response: z.string().trim().max(2000).optional(),
});

const DEFAULT_RESPONSE: Record<ApprovalAction, string> = {
  approve: 'stroke-board から承認',
  reject: 'stroke-board から却下',
};

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const approvalId = getRouterParam(event, 'approvalId') ?? '';
  const action = getRouterParam(event, 'action') ?? '';

  if (!isApprovalAction(action)) {
    // 本家は needs-revision も受けるが、stroke-board からは出さない
    throw createError({ statusCode: 400, statusMessage: 'unknown-approval-action' });
  }

  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid-body' });
  }

  const response = parsed.data.response?.trim();

  // 却下は理由が本家に残る。空のまま送ると「なぜ却下されたか」が失われる
  if (action === 'reject' && (response === undefined || response.length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'reject-needs-reason' });
  }

  const result = await upstreamClient().respondToApproval(
    projectId,
    approvalId,
    action,
    response === undefined || response.length === 0 ? DEFAULT_RESPONSE[action] : response,
  );

  if (!result.ok) throw toHttpError(result.failure);

  return { ok: true };
});

function isApprovalAction(value: string): value is ApprovalAction {
  return (APPROVAL_ACTIONS as readonly string[]).includes(value);
}
