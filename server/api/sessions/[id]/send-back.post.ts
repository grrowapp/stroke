import type { StrokeResult } from '#shared/types'
import { invokeAi } from '../../../utils/ai'
import { nextState } from '../../../utils/apply-outcome'
import { conflict } from '../../../utils/conflict'
import { sendBackPrompt } from '../../../utils/prompt'
import { parseBody, sendBackBody } from '../../../utils/request-schemas'
import { beginRun, endRun } from '../../../utils/running'
import { requireSessionId } from '../../../utils/session-param'
import { readState, writeState } from '../../../utils/session-store'
import { toStrokeResult } from '../../../utils/session-view'

/**
 * proposal を差し戻す。指摘は1つに畳まず4層のまま渡す。
 * 出し直された proposal が届くことも、先に問い返しが届くこともある。
 */
export default defineEventHandler(async (event): Promise<StrokeResult> => {
  const sessionId = await requireSessionId(event)
  const payload = parseBody(sendBackBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase !== 'proposed') {
    throw conflict('phase', '差し戻せるのは proposal が出ているときだけ。')
  }

  beginRun(sessionId)
  try {
    const outcome = await invokeAi({
      sessionId,
      prompt: sendBackPrompt(payload),
      first: false,
    })
    const next = nextState(state, outcome)
    await writeState(sessionId, next)
    return await toStrokeResult(sessionId, next, outcome)
  } finally {
    endRun(sessionId)
  }
})
