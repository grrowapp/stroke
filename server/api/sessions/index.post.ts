import { accessUserOf } from '../../utils/access/request'
import { parseBody, startSessionBody } from '../../utils/stroke/request-schemas'
import { createSession } from '../../utils/stroke/session-store'

/**
 * U1: 概要でセッションを開始する。受理と作成で完結し、AI の起動を含まない
 * （specs/api/overview）。起動はフロントが受理の成功応答後に invoke-agent へ要求する。
 *
 * 管理者でない利用者も始められる。始めた利用者のメールアドレスを記録し、作成途中の
 * ストロークはその本人と管理者にだけ見せる（`access/permission`）。
 */
export default defineEventHandler(async (event): Promise<{ sessionId: string }> => {
  const { overview } = parseBody(startSessionBody, await readBody(event))
  const user = await accessUserOf(event)
  const sessionId = await createSession(overview, user.email)
  return { sessionId }
})
