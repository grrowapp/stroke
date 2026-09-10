import { submitProposal } from '../../../../handler/proposal'
import { conflict } from '../../../../utils/stroke/conflict'
import { parseBody, proposalSubmitBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'

/**
 * A7: proposal の全文を提出する。初提出なら strokes へマーカー行を追記し、受理した瞬間に
 * W2 へ配信する。
 *
 * ここが持つのは**受け付けるかどうか**までである——本文が形として読み取れるか（400）と、
 * 提出してよい局面か（409）。受理を成立させる段——残す・phase を進める・配信する——は
 * `handler/proposal.ts` が1続きで持つ。順序（残す → phase を進める → 配信する）とその
 * 理由、出し直しで承認の判断が失効することも、そちらに書いてある。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { proposal, projectName } = parseBody(proposalSubmitBody, await readBody(event))

  const state = await readState(sessionId)
  // 承認以降（`approved` / `activated`）は proposal を受けない
  if (isPromotedState(state)) {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  await submitProposal(sessionId, state, proposal, projectName)

  return new Response(null, { status: 204 })
})
