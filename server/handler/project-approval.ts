import type { Annotation } from '#shared/stroke'
import { upstreamClient } from '../utils/control/upstream-proxy'
import type { ApprovalAction, UpstreamResult } from '../utils/upstream/rest'
import type { ApprovalRequest } from '../utils/upstream/schema'

/**
 * 本家 spec-workflow の承認依頼を仲介する実処理。
 *
 * **`server/handler/approve.ts` とは別物である。** あちらはストロークの承認（proposal を
 * 承認したという判断を `state.json` に記録する）で、こちらは本家が持つ承認依頼
 * （`.spec-workflow/approvals/` の1件）への応答である。
 *
 * stroke-board が `.spec-workflow/` へ直接書くことはない。書くのは本家で、こちらは本家の
 * REST を呼ぶだけである（ADR-0005 の「二重に書き込む主体を作らない」はこの形で保つ）。
 *
 * **受理してよいかの判定は持たない。** 何を受け付け何を 400 で断るかは endpoint が持つ
 * （`server/api/projects/[projectId]/approvals/**`）。
 */

/**
 * 応答本文が空のときに本家へ残す文。
 *
 * 却下は理由が要るので endpoint が空を通さないが、承認と差し戻しは省略できる。何も送らないと
 * 本家の承認ファイルに応答本文の無い決着が残るので、既定文を当てはめる。
 */
const DEFAULT_RESPONSE: Record<ApprovalAction, string> = {
  approve: 'stroke-board から承認',
  reject: 'stroke-board から却下',
  'needs-revision': 'stroke-board から差し戻し',
}

/** 保留中の承認依頼を取る（`GET /api/projects/:projectId/approvals`）。 */
export function listPendingApprovals(projectId: string): Promise<UpstreamResult<ApprovalRequest[]>> {
  return upstreamClient().listPendingApprovals(projectId)
}

/** 承認画面が表示する対象文書の中身を取る（`GET .../approvals/:approvalId/content`）。 */
export function getApprovalContent(
  projectId: string,
  approvalId: string,
): Promise<UpstreamResult<{ content: string }>> {
  return upstreamClient().getApprovalContent(projectId, approvalId)
}

/**
 * 承認依頼へ応答する（`POST .../approvals/:approvalId/:action`）。
 *
 * 本家へ送る値をここで組み立てる——応答本文が空なら action ごとの既定文を当てはめ、注釈は
 * 本家が受け取る1つの組（`annotations` と `comments`）へまとめる。注釈を運べるのは
 * 差し戻しだけだが、**その制限を掛けるのは endpoint である**——ここは渡されたものを本家の
 * 形へ写すだけで、渡してよいかを決めない。
 *
 * `comments` を持たない応答には注釈の組を付けない。空の組を送ると、本家の承認ファイルに
 * 空の注釈欄が増える。
 */
export function respondToApproval(
  projectId: string,
  approvalId: string,
  action: ApprovalAction,
  input: { response?: string, annotations?: string, comments?: Annotation[] },
): Promise<UpstreamResult<null>> {
  const response = input.response === undefined || input.response.length === 0
    ? DEFAULT_RESPONSE[action]
    : input.response

  return upstreamClient().respondToApproval(
    projectId,
    approvalId,
    action,
    response,
    input.comments === undefined
      ? undefined
      : { annotations: input.annotations ?? '', comments: input.comments },
  )
}
