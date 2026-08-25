import type { ProposalMessage } from '#shared/stroke'
import { conflict } from '../../../utils/stroke/conflict'
import { isKebabCase } from '../../../utils/stroke/project'
import { parseBody, proposalSubmitBody } from '../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { notifySubmission } from '../../../utils/stroke/submission-signal'
import { markProposalStrokeIfFirst, readState, writeState } from '../../../utils/stroke/session-store'
import { proposalChannel } from '../../../utils/stroke/ws-channels'

/**
 * A7: proposal の全文を提出する。初提出なら strokes へマーカー行を追記し、受理した瞬間に
 * W2 へ配信する。
 *
 * **ファイルは書かない。** proposal を書くのは claude で、セッションの時点から
 * `docs/proposal.md` に置く（openspec/specs/project/generation）。ここは本文を検証して
 * 受理・配信し、phase を進めるだけである。書かずに提出だけされた場合は、承認時に
 * 「proposal が見つからない」として既存の 409 経路で現れる。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { proposal, projectName } = parseBody(proposalSubmitBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  await markProposalStrokeIfFirst(sessionId)

  const candidate = projectName && isKebabCase(projectName) ? projectName : state.projectName
  // `invocation` には触れない。実行の記録を書くのは invokeAi だけである
  // （openspec/specs/agent/invocation の MUST）。
  await writeState(sessionId, {
    ...state,
    phase: 'proposed',
    currentQuestion: null,
    ...(candidate ? { projectName: candidate } : {}),
  })

  const message: ProposalMessage = { proposal, projectName: candidate ?? null }
  proposalChannel.publish(sessionId, message)
  // 完了の合図ではなく「作業が行われた」ことの記録。invokeAi が起動の前後で比べる。
  notifySubmission(sessionId)

  setResponseStatus(event, 200)
  return null
})
