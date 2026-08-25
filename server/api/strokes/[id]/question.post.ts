import { conflict } from '../../../utils/stroke/conflict'
import { parseQuestion } from '../../../utils/stroke/question'
import { requireSessionId } from '../../../utils/stroke/session-param'
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
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: '問いの構造として読み取れない。',
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

  setResponseStatus(event, 200)
  return null
})
