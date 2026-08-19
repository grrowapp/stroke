import type { StrokeResult } from '#shared/types'
import { invokeAi } from '../../../utils/ai'
import { nextState } from '../../../utils/apply-outcome'
import { conflict } from '../../../utils/conflict'
import { answerPrompt } from '../../../utils/prompt'
import { answerBody, parseBody } from '../../../utils/request-schemas'
import { beginRun, endRun } from '../../../utils/running'
import { requireSessionId } from '../../../utils/session-param'
import { appendStroke, readState, writeState } from '../../../utils/session-store'
import { toStrokeResult } from '../../../utils/session-view'

/** 今の問いに答える。ストロークの回答と、差し戻し後の問い返しへの回答の両方がここを通る。 */
export default defineEventHandler(async (event): Promise<StrokeResult> => {
  const sessionId = await requireSessionId(event)
  const { answer } = parseBody(answerBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには回答できない。')
  }

  const pending = state.phase === 'stroking' ? state.question : state.followupQuestion
  if (pending === null) {
    throw conflict('phase', '答えるべき問いが無い。')
  }

  // パンくずの道になるのはストロークだけ。差し戻し後の問い返しは道に積まない
  // （画面2 のパンくずの末尾は proposal であり、その後ろに粒は付かない）。
  const isStroke = state.phase === 'stroking'

  beginRun(sessionId)
  try {
    const outcome = await invokeAi({
      sessionId,
      prompt: answerPrompt(pending, answer),
      first: false,
    })
    const next = nextState(state, outcome)
    await writeState(sessionId, next)
    if (isStroke) {
      await appendStroke(sessionId, { question: pending, answer })
    }
    return await toStrokeResult(sessionId, next, outcome)
  } finally {
    endRun(sessionId)
  }
})
