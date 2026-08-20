import type { ProposalMessage } from '#shared/types'
import { conflict } from '../../utils/conflict'
import { isKebabCase } from '../../utils/project'
import { parseBody, proposalSubmitBody } from '../../utils/request-schemas'
import { requireSessionId } from '../../utils/session-param'
import { markProposalStrokeIfFirst, readState, writeProposal, writeState } from '../../utils/session-store'
import { notifySubmission } from '../../utils/submission-signal'
import { proposalChannel } from '../../utils/ws-channels'

/**
 * A7: proposal の全文を提出する。受理したら `proposal.md` へ保存し（サーバが書く）、
 * 初提出なら strokes へマーカー行を追記し、受理した瞬間に W2 へ配信する。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { proposal, projectName } = parseBody(proposalSubmitBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  await markProposalStrokeIfFirst(sessionId)
  await writeProposal(sessionId, proposal)

  const candidate = projectName && isKebabCase(projectName) ? projectName : state.projectName
  await writeState(sessionId, {
    ...state,
    phase: 'proposed',
    currentQuestion: null,
    invocation: 'idle',
    ...(candidate ? { projectName: candidate } : {}),
  })

  const message: ProposalMessage = { proposal, projectName: candidate ?? null }
  proposalChannel.publish(sessionId, message)
  notifySubmission(sessionId)

  setResponseStatus(event, 200)
  return null
})
