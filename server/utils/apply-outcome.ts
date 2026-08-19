import type { Question } from '#shared/types'
import type { SessionState } from './session-store'

/**
 * AI の呼び出し1回から得られたもの。
 *
 * ストロークの往復では次の問いが返り、把握完了では proposal が起きる。この2つしかない。
 */
export type AiOutcome =
  | { kind: 'question', question: Question }
  | { kind: 'proposal', proposal: string, projectName?: string }

/**
 * セッションを開始した直後の状態。まだ前の局面が無いので、届いたものだけで決まる。
 *
 * 最初の呼び出しで proposal が起きることは通常ない（1つも問わずに把握完了になる）が、
 * 起きた場合に弾く理由も無いので、そのまま `proposed` として受ける。
 */
export function initialState(outcome: AiOutcome): SessionState {
  if (outcome.kind === 'question') {
    return { phase: 'stroking', question: outcome.question }
  }
  return {
    phase: 'proposed',
    ...(outcome.projectName ? { projectName: outcome.projectName } : {}),
    followupQuestion: null,
  }
}

/**
 * 今の局面と届いたものから、次の局面を決める。
 *
 * - ストローク中に問いが来た → 次の問いへ差し替わる
 * - ストローク中に proposal が来た → 把握完了。確認の局面へ移る
 * - 確認の局面で問いが来た → 差し戻しへの問い返し。局面は動かさず、答えを待つ問いだけ立てる
 * - 確認の局面で proposal が来た → 出し直された。問い返しは畳む
 *
 * 承認後に AI を呼ぶ経路は無い。呼ばれたとしても局面は動かさない。
 */
export function nextState(current: SessionState, outcome: AiOutcome): SessionState {
  if (current.phase === 'approved') return current

  if (current.phase === 'stroking') {
    if (outcome.kind === 'question') {
      return { phase: 'stroking', question: outcome.question }
    }
    return {
      phase: 'proposed',
      ...(outcome.projectName ? { projectName: outcome.projectName } : {}),
      followupQuestion: null,
    }
  }

  if (outcome.kind === 'question') {
    return {
      phase: 'proposed',
      // 問い返しの間も、既に出ている名前の候補は保つ。
      ...(current.projectName ? { projectName: current.projectName } : {}),
      followupQuestion: outcome.question,
    }
  }

  return {
    phase: 'proposed',
    // 出し直しで新しい名前が来なければ、前の候補を残す。
    ...(outcome.projectName ?? current.projectName
      ? { projectName: outcome.projectName ?? current.projectName }
      : {}),
    followupQuestion: null,
  }
}
