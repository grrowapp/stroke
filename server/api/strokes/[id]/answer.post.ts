import type { Answer, Question, Stroke } from '#shared/stroke'
import { conflict } from '../../../utils/stroke/conflict'
import { answerBody, parseBody } from '../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { appendAnswerStroke, readState, readStrokes } from '../../../utils/stroke/session-store'

/** リトライ判定用。invocation が失敗した後、同じ問いへの同じ回答が再送されたか。 */
function isRetryOfLastStroke(last: Stroke | undefined, question: Question, answer: Answer): boolean {
  if (!last || last.proposal) return false
  return JSON.stringify(last.question) === JSON.stringify(question)
    && JSON.stringify(last.answer) === JSON.stringify(answer)
}

/**
 * U7: 今の1問に答える。ストロークの問いへの回答も、差し戻しへの問い返しへの回答も
 * この口で送る（design.md 決定3）。受理は記録までで完結し、AI の起動を含まない
 * （specs/api/answer）。起動はフロントが受理の成功応答後に invoke-agent へ要求する。
 *
 * `currentQuestion` はここではクリアしない。次の問い・proposal（A5・A7）が届いて初めて
 * 更新される。`invocation: failed` の後にユーザーが同じ入力を再送したとき（U2 の契約）、
 * 答えるべき問いが無くなって詰むのを避けるため、かつ strokes に重複行が増えないようにする
 * （decisions.md: 同じ入力の再送で往復が二重に入ってはならない）。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const answer = parseBody(answerBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', '承認済みのセッションには回答できない。')
  }
  const pending = state.currentQuestion
  if (pending === null) {
    throw conflict('phase', '答えるべき問いが無い。')
  }

  const strokes = await readStrokes(sessionId)
  const retry = state.invocation === 'failed' && isRetryOfLastStroke(strokes.at(-1), pending, answer)
  if (!retry) {
    await appendAnswerStroke(sessionId, pending, answer)
  }

  setResponseStatus(event, 200)
  return null
})
