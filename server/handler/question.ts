import type { Phase, Question } from '#shared/stroke'
import { recordLaunchSubmissionIfActive } from '../utils/stroke/submission-signal'
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
 * 受理した問いを残す。**流さない。**
 *
 * 配信は、この提出を行った実行の決着（`settleQuestion`）が行う。受理した瞬間に流すと、
 * claude の実行がまだ終わっていないのに回答できる状態が立ち、その回答が要求する次の起動が
 * 走っている実行と重なる（change fix-rename-during-running-session）。
 *
 * `invocation` には触れない。実行の記録を書くのは invoke-agent だけで、完了は invoke-agent が
 * 子プロセスの output stream で検知する（openspec/specs/agent/invocation の MUST）。`state` は
 * endpoint が承認以降を断った後のものを受け取る——問い以外の項目を1つも動かさないため、
 * 丸ごと写して `currentQuestion` だけを差し替える。
 *
 * `token` はこの提出を起こした claude の接続（`x-stroke-token`）。決着が「何が提出されたか」を
 * 読むための記録に使う。代行するツールはこれを転送するだけで、記録しない
 * （`docs/specs/mcp/contract.md`）。
 */
export async function submitQuestion(
  sessionId: string,
  state: ActiveSessionState,
  question: Question,
  token: string | undefined,
): Promise<void> {
  await writeState(sessionId, { ...state, currentQuestion: question })
  recordLaunchSubmissionIfActive(token, 'question')
}

/**
 * 実行の決着で、記録された今の1問を W1 へ流す。
 *
 * 叩くのは invoke-agent だけである（A9）。記録が無ければ流さない——提出が受理されていれば
 * `currentQuestion` は在る。
 */
export async function settleQuestion(sessionId: string, state: ActiveSessionState): Promise<void> {
  if (state.currentQuestion) questionChannel.publish(sessionId, state.currentQuestion)
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
