import type { SessionView, StrokeResult } from '#shared/types'
import type { AiOutcome } from './apply-outcome'
import { resolveAvailableProjectName } from './project'
import { readProposal, readState, readStrokes, type SessionState } from './session-store'

/**
 * 画面が必要とするセッションの全体像を組み立てる。
 *
 * 局面は `state.json` に保存された `phase` がそのまま載る。proposal 本文だけは状態に
 * 持たせず `proposal.md` から読む（AI が書いたファイルが正）。
 */
export async function buildSessionView(
  sessionId: string,
  state?: SessionState,
): Promise<SessionView> {
  const current = state ?? await readState(sessionId)
  const strokes = await readStrokes(sessionId)

  if (current.phase === 'stroking') {
    return { sessionId, strokes, phase: 'stroking', question: current.question }
  }

  const proposal = await requireProposal(sessionId)

  if (current.phase === 'approved') {
    return {
      sessionId,
      strokes,
      phase: 'approved',
      proposal,
      projectName: current.projectName,
    }
  }

  const projectName = current.projectName
    ? await resolveAvailableProjectName(current.projectName)
    : undefined

  return {
    sessionId,
    strokes,
    phase: 'proposed',
    proposal,
    ...(projectName ? { projectName } : {}),
    followupQuestion: current.followupQuestion,
  }
}

/**
 * 回答・差し戻しの結果。届いたものと、その結果決まった局面から作る。
 *
 * ストローク中の問いは次の問い、確認の局面での問いは差し戻しへの問い返しになる。
 */
export async function toStrokeResult(
  sessionId: string,
  next: SessionState,
  outcome: AiOutcome,
): Promise<StrokeResult> {
  if (outcome.kind === 'proposal') {
    return {
      outcome: 'proposal',
      phase: 'proposed',
      proposal: outcome.proposal,
      ...(next.phase === 'proposed' && next.projectName ? { projectName: next.projectName } : {}),
    }
  }

  if (next.phase === 'stroking') {
    return { outcome: 'question', phase: 'stroking', question: outcome.question }
  }

  return {
    outcome: 'followup',
    phase: 'proposed',
    question: outcome.question,
    proposal: await requireProposal(sessionId),
  }
}

/** proposal が在ることが前提の局面で無かったら、状態の方が壊れている。 */
async function requireProposal(sessionId: string): Promise<string> {
  const proposal = await readProposal(sessionId)
  if (proposal === undefined) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: `proposal.md が見つからない: ${sessionId}`,
    })
  }
  return proposal
}
