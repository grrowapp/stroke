import type { SessionStatus } from '#shared/stroke'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { sessionDir } from '../../../utils/stroke/paths'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState } from '../../../utils/stroke/session-store'

/** U2: セッションの状態（phase・呼び出しの実行状態）を見る。リロード時の行き先判定に使う。 */
export default defineEventHandler(async (event): Promise<SessionStatus> => {
  const sessionId = await requireSessionId(event)
  const state = await readState(sessionId)
  // `approved` も `invocation` を持つ（openspec/specs/agent/invocation）。
  // 昇格後は steering の実行が起こるので、ここで潰さずそのまま返す。
  // `path` は画面が cwd として U13 に渡すためのもの（design.md D5）。
  return {
    phase: state.phase,
    invocation: state.invocation,
    path: sessionDir(readStrokeConfig().projectShareRoot, sessionId),
  }
})
