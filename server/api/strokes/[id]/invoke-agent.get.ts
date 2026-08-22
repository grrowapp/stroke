import { invokeAi } from '../../../utils/stroke/ai'
import { conflict } from '../../../utils/stroke/conflict'
import { beginRun, endRun } from '../../../utils/stroke/running'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState, writeState } from '../../../utils/stroke/session-store'

/**
 * AI（claude）を起動する唯一の入口（specs/api/invoke-agent）。受理系 endpoint は起動を
 * 持たず、フロントが受理の成功応答の直後にここを GET で呼ぶ（design.md 決定6）。
 * 初回か継続か・渡す定型はここでは決めない（invokeAi が保存済み記録から導く）。
 * 受理して即返し、結果はエージェントの提出（A5・A7）が届ける。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    // 承認後は提出も受け付けない（specs/agent-api）。起動だけが通る宙吊りを作らない。
    throw conflict('phase', '承認済みのセッションは起動できない。')
  }

  // busy ガード。多重起動はここで止める（specs/api/invoke-agent）。
  beginRun(sessionId)
  try {
    await writeState(sessionId, { ...state, invocation: 'running' })
  } catch (error) {
    endRun(sessionId)
    throw error
  }

  invokeAi(sessionId)
    .catch((error) => {
      console.error(`[stroke-board] AI 呼び出しの管理に失敗: ${sessionId}`, error)
    })
    .finally(() => endRun(sessionId))

  setResponseStatus(event, 200)
  return null
})
