import type { ProposalMessage } from '#shared/stroke'
import { conflict } from '../../../utils/stroke/conflict'
import { isKebabCase } from '../../../utils/stroke/project'
import { parseBody, proposalSubmitBody } from '../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { notifySubmission } from '../../../utils/stroke/submission-signal'
import {
  markProposalStrokeIfFirst,
  readState,
  sessionProposal,
  writeState,
} from '../../../utils/stroke/session-store'
import { proposalChannel } from '../../../utils/stroke/ws-channels'

/**
 * A7: proposal の全文を提出する。初提出なら strokes へマーカー行を追記し、受理した瞬間に
 * W2 へ配信する。
 *
 * **受理した本文はここで残す。** 配信（`publish`）はメモリ上の接続にしか届かないので、
 * 残さないと「提出の瞬間に繋いでいた画面にしか出ない」ことになる。繋ぎ直した画面にも
 * 承認にも同じ proposal が要る（openspec/specs/api/stroke/proposal）。
 *
 * 順序は **残す → phase を進める → 配信する**。残せなければそこで失敗を返し、phase も
 * 配信も行わない。逆順にすると、配信だけ届いて残っていない状態が作れてしまう。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { proposal, projectName } = parseBody(proposalSubmitBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  // 受理を成立させる前に残す。ここが失敗したら phase も配信も行わない
  await sessionProposal(sessionId).write(proposal)

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

  // 受理と記録で完結する口なので、本文を持たない 204 を返す
  // （`docs/specs/api/contract.md` A7「output: 本文なし（204）」）。
  setResponseStatus(event, 204)
  return null
})
