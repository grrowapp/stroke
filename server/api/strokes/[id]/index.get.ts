import type { SessionStatus } from '#shared/stroke'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState } from '../../../utils/stroke/session-store'

/** U2: セッションの状態（phase・呼び出しの実行状態）を見る。リロード時の行き先判定に使う。 */
export default defineEventHandler(async (event): Promise<SessionStatus> => {
  const sessionId = await requireSessionId(event)
  const state = await readState(sessionId)
  return {
    phase: state.phase,
    invocation: state.phase === 'approved' ? 'idle' : state.invocation,
  }
})
