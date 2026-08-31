import { conflict } from '../../../utils/stroke/conflict'
import { parseQuestion, questionViolations } from '../../../utils/stroke/question'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { notifySubmission } from '../../../utils/stroke/submission-signal'
import { readState, writeState } from '../../../utils/stroke/session-store'
import { questionChannel } from '../../../utils/stroke/ws-channels'

/**
 * A5: 今の1問を提出する。ストロークの問いも差し戻しへの問い返しも、この口で受け、
 * エージェントに区別を求めない（design.md 決定3）。受理した瞬間に W1 へ配信する。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const body = await readBody(event)

  const question = parseQuestion(body)
  if (!question) {
    // **どの項目がどう反したかを返す。** 理由が無いと、送り手は形を当てるまで送り続ける
    // （実測 2026-08-28: `description` が 1 字超過し続け 400 を5回。何を削ればよいか
    // 掴めず、極端に短い問いを投げて当てにいく挙動になった）。
    const violations = questionViolations(body)
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: violations.length === 0
        ? '問いの構造として読み取れない。'
        : `問いの構造として読み取れない。${violations.join(' / ')}`,
    })
  }

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  // `invocation` には触れない。実行の記録を書くのは invokeAi だけで、完了は invokeAi が
  // 子プロセスの output stream で検知する（openspec/specs/agent/invocation の MUST）。
  await writeState(sessionId, { ...state, currentQuestion: question })
  questionChannel.publish(sessionId, question)
  // 完了の合図ではなく「作業が行われた」ことの記録。invokeAi が起動の前後で比べる。
  notifySubmission(sessionId)

  // 受理と記録で完結する口なので、本文を持たない 204 を返す
  // （`docs/specs/api/contract.md` A5「output: 本文なし（204）」）。
  setResponseStatus(event, 204)
  return null
})
