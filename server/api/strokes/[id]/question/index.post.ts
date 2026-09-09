import { submitQuestion } from '../../../../handler/question'
import { conflict } from '../../../../utils/stroke/conflict'
import { parseQuestion } from '../../../../utils/stroke/question'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'

/**
 * A5: 今の1問を提出する。ストロークの問いも差し戻しへの問い返しも、この口で受け、
 * エージェントに区別を求めない（design.md 決定3）。受理した瞬間に W1 へ配信する。
 *
 * ここが持つのは**受け付けるかどうか**までである——本文が問いとして読み取れるか（400）と、
 * 提出してよい局面か（409）。残すことと配信することは `handler/question.ts` が持つ。
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
  // 承認以降（`approved` / `activated`）は問いを持たない
  if (isPromotedState(state)) {
    throw conflict('phase', '承認済みのセッションには提出できない。')
  }

  await submitQuestion(sessionId, state, question)

  return new Response(null, { status: 204 })
})
