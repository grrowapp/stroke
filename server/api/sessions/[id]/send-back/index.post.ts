import { conflict } from '../../../../utils/stroke/conflict'
import { parseBody, sendBackBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { readState, writeSendBack } from '../../../../utils/stroke/session-store'

/**
 * U9: proposal を差し戻す。指摘一式はサーバが保存し（A4 が読む）、エージェントは
 * 問い返し（A5）または proposal の出し直し（A7）で応じる。受理は記録までで完結し、
 * AI の起動を含まない（specs/api/send-back）。起動はフロントが受理の成功応答後に
 * invoke-agent へ要求する。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const payload = parseBody(sendBackBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase !== 'proposed') {
    throw conflict('phase', '差し戻せるのは proposal が出ているときだけ。')
  }

  await writeSendBack(sessionId, payload)

  return new Response(null, { status: 204 })
})
