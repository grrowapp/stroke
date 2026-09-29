import { submitProposal } from '../../../../handler/proposal'
import { conflict } from '../../../../utils/stroke/conflict'
import { parseBody, proposalSubmitBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * A7: proposal の全文を提出する。初提出なら strokes へマーカー行を追記する。
 *
 * **受理は記録までである。** phase を進めず、画面へも配信しない——どちらも、この提出を
 * 行った実行の決着（A9）が行う（change fix-rename-during-running-session）。ここで phase を
 * `proposed` にすると、claude の実行がまだ終わっていないのに承認できる局面が立ち、承認が
 * 呼ぶ昇格（U14）の改名が走っている claude を置き去りにする。
 *
 * ここが持つのは**受け付けるかどうか**までである——本文が形として読み取れるか（400）と、
 * 提出してよい局面か（409）。残すことと、出し直しで承認の判断が失効することは
 * `handler/proposal.ts` が持つ。
 */
export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const { proposal, projectName } = parseBody(proposalSubmitBody, await readBody(event))

  const state = await readState(sessionId)
  // 承認以降（`approved` / `activated`）は proposal を受けない
  if (isPromotedState(state)) {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  await submitProposal(sessionId, state, proposal, projectName, getHeader(event, 'x-stroke-token'))

  return new Response(null, { status: 204 })
})
