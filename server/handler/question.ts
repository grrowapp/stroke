import type { Phase, Question } from '#shared/stroke'
import { notifySubmission } from '../utils/stroke/submission-signal'
import {
  isPromotedState,
  readState,
  writeState,
  type ActiveSessionState,
} from '../utils/stroke/session-store'
import { questionChannel } from '../utils/stroke/ws-channels'

/**
 * 「今の1問」の実処理——A5 が受理して残す側と、W1 が接続の瞬間に流す側。
 *
 * **書く側と読む側を1つのファイルに置く。** A5 が `state.currentQuestion` へ残したものを、
 * W1 が繋ぎ直した画面へそのまま流す。同じ1つの「現在分」を指しているので、残す形と流す形が
 * 一致していることがここで読める。
 *
 * **受理してよい局面・流してよい局面はここでは決めない。** どちらも端（endpoint と route）が
 * 自分の literal で持つ（`server/api/strokes/[id]/question/index.post.ts`・
 * `server/routes/api/sessions/[id]/ws/question.ts`）。
 */

/**
 * 受理した問いを残し、W1 へ流す。
 *
 * `invocation` には触れない。実行の記録を書くのは invokeAi だけで、完了は invokeAi が子プロセスの
 * output stream で検知する（openspec/specs/agent/invocation の MUST）。`state` は endpoint が
 * 承認以降を断った後のものを受け取る——問い以外の項目を1つも動かさないため、丸ごと写して
 * `currentQuestion` だけを差し替える。
 */
export async function submitQuestion(
  sessionId: string,
  state: ActiveSessionState,
  question: Question,
): Promise<void> {
  await writeState(sessionId, { ...state, currentQuestion: question })
  questionChannel.publish(sessionId, question)
  // 完了の合図ではなく「作業が行われた」ことの記録。invokeAi が起動の前後で比べる。
  notifySubmission(sessionId)
}

/**
 * 接続の瞬間に流す現在の1問。流すものが無ければ `null`。
 *
 * `from` に当てはまる局面のときだけ返す。集合を決めるのは route であり、ここは当てはめる
 * だけである。**`isPromotedState` は流せる形かの確認**で、受理する局面を増やしも減らしもしない
 * ——昇格後の形（`PromotedState`）は問いの項目そのものを持たないため、型の判別子で確かめる。
 *
 * `state.json` が読めなければそのまま投げる。読めないときに無言で「流すものが無い」に倒すと、
 * 壊れていることが接続の側から見えなくなる。
 */
export async function currentQuestion(
  sessionId: string,
  from: readonly Phase[],
): Promise<Question | null> {
  const state = await readState(sessionId)
  if (!from.includes(state.phase)) return null
  if (isPromotedState(state)) return null
  return state.currentQuestion
}
