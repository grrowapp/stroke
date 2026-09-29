import { recordAnswer } from '../../../../handler/answer'
import { conflict } from '../../../../utils/stroke/conflict'
import { answerBody, parseBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * U7: 今の1問に答える。ストロークの問いへの回答も、差し戻しへの問い返しへの回答も
 * この口で送る（design.md 決定3）。受理は記録までで完結し、AI の起動を含まない
 * （specs/api/answer）。起動はフロントが受理の成功応答後に invoke-agent へ要求する。
 *
 * `currentQuestion` はここではクリアしない。次の問い・proposal（A5・A7）が届いて初めて
 * 更新される。`invocation: failed` の後にユーザーが同じ入力を再送したとき（U2 の契約）、
 * 答えるべき問いが無くなって詰むのを避けるためで、再送で往復が二重に入らないようにする
 * のは記録の側（`handler/answer.ts`）の役目である。
 */
export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const answer = parseBody(answerBody, await readBody(event))

  const state = await readState(sessionId)
  // 承認以降（`approved` / `activated`）は1つの門で断つ。理由は「承認済み」であって、
  // 問いの有無ではない（openspec/specs/api/session/answer）
  if (isPromotedState(state)) {
    throw conflict('phase', '承認済みのセッションには回答できない。')
  }
  const pending = state.currentQuestion
  if (pending === null) {
    throw conflict('phase', '答えるべき問いが無い。')
  }

  await recordAnswer(sessionId, pending, answer, state.invocation)

  return new Response(null, { status: 204 })
})
