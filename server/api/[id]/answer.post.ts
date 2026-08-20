import type { Answer, Question, Stroke } from '#shared/types'
import { invokeAi } from '../../utils/ai'
import { conflict } from '../../utils/conflict'
import { continuePrompt } from '../../utils/prompt'
import { answerBody, parseBody } from '../../utils/request-schemas'
import { beginRun, endRun } from '../../utils/running'
import { requireSessionId } from '../../utils/session-param'
import { appendAnswerStroke, readState, readStrokes, writeState } from '../../utils/session-store'

/** リトライ判定用。invocation が失敗した後、同じ問いへの同じ回答が再送されたか。 */
function isRetryOfLastStroke(last: Stroke | undefined, question: Question, answer: Answer): boolean {
  if (!last || last.proposal) return false
  return JSON.stringify(last.question) === JSON.stringify(question)
    && JSON.stringify(last.answer) === JSON.stringify(answer)
}

/**
 * U7: 今の1問に答える。ストロークの問いへの回答も、差し戻しへの問い返しへの回答も
 * この口で送る（design.md 決定3）。受理の動きは常に同じ:
 * （今の1問 + 回答）を strokes へ追記し、次の呼び出しを起動する。
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

  // busy ガードは、これより後の永続化・AI 起動より前に済ませる(先に検証だけ通した
  // 別リクエストと衝突しても、負けた側はここで 409 になり何も書かない)。
  beginRun(sessionId)
  try {
    const strokes = await readStrokes(sessionId)
    const retry = state.invocation === 'failed' && isRetryOfLastStroke(strokes.at(-1), pending, answer)
    if (!retry) {
      await appendAnswerStroke(sessionId, pending, answer)
    }
    await writeState(sessionId, { ...state, invocation: 'running' })
  } catch (error) {
    endRun(sessionId)
    throw error
  }

  invokeAi({ sessionId, prompt: continuePrompt(), first: false })
    .catch((error) => {
      console.error(`[stroke-board] AI 呼び出しの管理に失敗: ${sessionId}`, error)
    })
    .finally(() => endRun(sessionId))

  setResponseStatus(event, 200)
  return null
})
