import type { SessionStatus } from '#shared/stroke'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState } from '../../../utils/stroke/session-store'

/** U2: セッションの状態（phase・呼び出しの実行状態）を見る。リロード時の行き先判定に使う。 */
export default defineEventHandler(async (event): Promise<SessionStatus> => {
  const sessionId = await requireSessionId(event)
  const state = await readState(sessionId)
  // `approved` も `invocation` を持つ（openspec/specs/agent/invocation）。
  // 昇格後は steering の実行が起こるので、ここで潰さずそのまま返す。
  return { phase: state.phase, invocation: state.invocation }
})
