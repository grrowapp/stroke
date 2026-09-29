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

import { respondToApproval } from '../../../../../../handler/project-approval';
import { APPROVAL_ACTIONS, type ApprovalAction } from '../../../../../../utils/upstream/rest';
import { toHttpError } from '../../../../../../utils/control/upstream-proxy';
import { requireProjectId } from '../../../../../../utils/access/request';

/**
 * 注釈1件。`#shared/stroke` の `Annotation` と同じ形を、境界で検証できるように zod で持つ。
 *
 * ここを緩めて素通しにすると、本家の approval JSON に何でも書けてしまう。書くのは
 * 本家でも、何を書かせるかを決めているのはこの口である。
 */
const highlightColorSchema = z.object({
  name: z.enum(['yellow', 'green', 'blue', 'pink', 'orange']),
  bg: z.string().max(64),
  border: z.string().max(64),
});

const annotationSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().max(128),
    type: z.literal('general'),
    comment: z.string().trim().min(1).max(2000),
    timestamp: z.string().max(64),
  }),
  z.object({
    id: z.string().max(128),
    type: z.literal('selection'),
    comment: z.string().trim().min(1).max(2000),
    timestamp: z.string().max(64),
    selectedText: z.string().max(20000),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    highlightColor: highlightColorSchema,
  }),
]);

/**
 * 本家は body の `response` を応答本文として保存し、`annotations` / `comments` を
 * 同じファイルの別フィールドに書く。
 *
 * 却下は理由が要るので空を通さない。承認は既定文を使うので省略できる。
 *
 * `response` の上限は 2000 字だったが、差し戻しの `response` は人が書いた文ではなく
 * コメントから組み立てた要約で、件数に比例して伸びる。上限は action ごとに変えず、
 * 一番長くなる差し戻しに合わせて 1 本で持つ。
 */
const bodySchema = z.object({
  response: z.string().trim().max(200000).optional(),
  annotations: z.string().max(1000000).optional(),
  comments: z.array(annotationSchema).max(100).optional(),
});

export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireProjectId(event, getRouterParam(event, 'projectId') ?? '')
  const projectId = getRouterParam(event, 'projectId') ?? '';
  const approvalId = getRouterParam(event, 'approvalId') ?? '';
  const action = getRouterParam(event, 'action') ?? '';

  if (!isApprovalAction(action)) {
    throw createError({ statusCode: 400, statusMessage: 'unknown-approval-action' });
  }

  const parsed = bodySchema.safeParse(await readBody(event).catch(() => ({})));

  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid-body' });
  }

  const response = parsed.data.response?.trim();
  const { annotations, comments } = parsed.data;

  // 却下は理由が本家に残る。空のまま送ると「なぜ却下されたか」が失われる
  if (action === 'reject' && (response === undefined || response.length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'reject-needs-reason' });
  }

  /*
   * 注釈を運べるのは差し戻しだけである。
   *
   * 本家は `approve` / `reject` にも `annotations` / `comments` を渡せてしまうが、
   * あちらの画面はそこへ渡していない（`ApprovalsPage.tsx` は `needs-revision` の
   * ときだけ組む）。ここで弾いておけば、承認したのにコメントが残っている
   * approval JSON を作らずに済む。
   */
  if (action !== 'needs-revision' && (annotations !== undefined || comments !== undefined)) {
    throw createError({ statusCode: 400, statusMessage: 'annotations-need-revision' });
  }

  // 差し戻しはコメントが本体である。0件で送ると、本家には理由の無い差し戻しだけが残る
  if (action === 'needs-revision' && (comments === undefined || comments.length === 0)) {
    throw createError({ statusCode: 400, statusMessage: 'revision-needs-comments' });
  }

  // 本家へ送る値の組み立て（応答本文が空のときの既定文・注釈のまとめ方）は handler が持つ
  const result = await respondToApproval(projectId, approvalId, action, { response, annotations, comments });

  if (!result.ok) throw toHttpError(result.failure);

  return { ok: true };
});

function isApprovalAction(value: string): value is ApprovalAction {
  return (APPROVAL_ACTIONS as readonly string[]).includes(value);
}
