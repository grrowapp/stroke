import type { SessionStatus } from '#shared/types'
import { requireSessionId } from '../../utils/session-param'
import { readState } from '../../utils/session-store'

/** U2: セッションの状態（phase・呼び出しの実行状態）を見る。リロード時の行き先判定に使う。 */
export default defineEventHandler(async (event): Promise<SessionStatus> => {
  const sessionId = await requireSessionId(event)
  const state = await readState(sessionId)
  return {
    phase: state.phase,
    invocation: state.phase === 'approved' ? 'idle' : state.invocation,
  }
})
