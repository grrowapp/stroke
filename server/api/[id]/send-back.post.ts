import { invokeAi } from '../../utils/ai'
import { conflict } from '../../utils/conflict'
import { continuePrompt } from '../../utils/prompt'
import { parseBody, sendBackBody } from '../../utils/request-schemas'
import { beginRun, endRun } from '../../utils/running'
import { requireSessionId } from '../../utils/session-param'
import { readState, writeSendBack, writeState } from '../../utils/session-store'

/**
 * U9: proposal を差し戻す。指摘一式はサーバが保存し（A4 が読む）、エージェントは
 * 問い返し（A5）または proposal の出し直し（A7）で応じる。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const payload = parseBody(sendBackBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase !== 'proposed') {
    throw conflict('phase', '差し戻せるのは proposal が出ているときだけ。')
  }

  beginRun(sessionId)
  try {
    await writeSendBack(sessionId, payload)
    await writeState(sessionId, { ...state, invocation: 'running' })
  } catch (error) {
    endRun(sessionId)
    throw error
  }

  invokeAi({ sessionId, prompt: continuePrompt(), first: false })
    .catch((error) => {
      console.error(`[stroke-board] AI 呼び出しの管理に失敗: ${sessionId}`, error)
    })
    .finally(() => endRun(sessionId))

  setResponseStatus(event, 200)
  return null
})
