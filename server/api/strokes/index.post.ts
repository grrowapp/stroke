import { parseBody, startSessionBody } from '../../utils/stroke/request-schemas'
import { createSession } from '../../utils/stroke/session-store'

/**
 * U1: 概要でセッションを開始する。受理と作成で完結し、AI の起動を含まない
 * （specs/api/overview）。起動はフロントが受理の成功応答後に invoke-agent へ要求する。
 */
export default defineEventHandler(async (event): Promise<{ sessionId: string }> => {
  const { overview } = parseBody(startSessionBody, await readBody(event))
  const sessionId = await createSession(overview)
  return { sessionId }
})
