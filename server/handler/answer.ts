import type { Answer, Invocation, Question, Stroke } from '#shared/stroke'
import { appendAnswerStroke, readStrokes } from '../utils/stroke/session-store'

/**
 * U7 の実処理——今の1問への回答をストロークへ追記する。
 *
 * **受理してよい局面かはここでは見ない**（承認済みか・答えるべき問いが在るか）。それは
 * endpoint が `readState` の結果に対して持つ（`server/api/sessions/[id]/answer/index.post.ts`）。
 */

/** リトライ判定用。invocation が失敗した後、同じ問いへの同じ回答が再送されたか。 */
function isRetryOfLastStroke(last: Stroke | undefined, question: Question, answer: Answer): boolean {
  if (!last || last.proposal) return false
  return JSON.stringify(last.question) === JSON.stringify(question)
    && JSON.stringify(last.answer) === JSON.stringify(answer)
}

/**
 * 回答を記録する。**同じ入力の再送では往復を二重に入れない。**
 *
 * `invocation: failed` の後にユーザーが同じ入力を再送したとき（U2 の契約）、strokes に
 * 重複行が増えないようにする（decisions.md: 同じ入力の再送で往復が二重に入ってはならない）。
 * 判定の材料は「直前の実行が失敗しているか」と「末尾の往復が同じ問い・同じ回答か」の2つで、
 * どちらも局面（phase）ではない。
 *
 * 追記したかどうかは返さない——再送でも新規でも、呼び手（画面）から見た受理は同じである。
 */
export async function recordAnswer(
  sessionId: string,
  question: Question,
  answer: Answer,
  invocation: Invocation | undefined,
): Promise<void> {
  const strokes = await readStrokes(sessionId)
  const retry = invocation === 'failed' && isRetryOfLastStroke(strokes.at(-1), question, answer)
  if (retry) return

  await appendAnswerStroke(sessionId, question, answer)
}
