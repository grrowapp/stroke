import { invokeAi } from '../../utils/ai'
import { conflict } from '../../utils/conflict'
import { beginRun, endRun } from '../../utils/running'
import { missingPrerequisites } from '../../utils/readiness'
import { requireSessionId } from '../../utils/session-param'
import { readState, writeState } from '../../utils/session-store'

/**
 * AI（claude）を起動する唯一の入口（specs/api/invoke-agent）。受理系 endpoint は起動を
 * 持たず、フロントが受理の成功応答の直後にここを GET で呼ぶ（design.md 決定6）。
 * 初回か継続か・渡す定型はここでは決めない（invokeAi が保存済み記録から導く）。
 * 受理して即返し、結果はエージェントの提出（A5・A7）が届ける。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)

  // 前提が欠けている間は起動を受け付けない（specs/api/invoke-agent）。判定はここで行い、
  // 起動時の結果を持ち越さない（design.md 決定2）。409 とは別にする: 画面は 409 を
  // 「待てば通る」と読むが（utils/conflict）、こちらは環境か設定を直すまで通らない。
  const missing = await missingPrerequisites()
  if (missing.length > 0) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: `AI を起動できる状態にない: ${missing.join(' / ')}`,
    })
  }

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
