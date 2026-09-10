import { settleProposal } from './proposal'
import { settleQuestion } from './question'
import type { SubmissionKind } from '../utils/stroke/submission-signal'
import type { ActiveSessionState } from '../utils/stroke/session-store'

/**
 * 実行の決着の実処理——その実行で提出されたものに応じて、局面を切り替え画面へ届ける。
 *
 * **局面が動くのはここだけである。** 提出を受ける口（A5・A7）は記録だけを行い、phase の
 * 切り替えと配信は決着が持つ。局面が変わってよいのは実行が終わった時点だけで、それを知るのは
 * 子プロセスを制御する invoke-agent だけだからである
 * （openspec/specs/agent/invocation・change fix-rename-during-running-session）。
 *
 * **何をするかは引数（`submitted`）が決める。** ここが状態を見て選ぶのではない——引数で
 * 制御される分岐は契約に現れるので ADR-0014 の対象外である。
 *
 * 受理してよい局面は端（endpoint）が自分の literal で持つ（`handler/question.ts` と同じ）。
 */
export async function settle(
  sessionId: string,
  state: ActiveSessionState,
  submitted: SubmissionKind,
): Promise<boolean> {
  if (submitted === 'question') {
    await settleQuestion(sessionId, state)
    return true
  }
  return await settleProposal(sessionId, state)
}
