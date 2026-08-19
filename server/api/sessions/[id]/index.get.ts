import type { SessionView } from '#shared/types'
import { requireSessionId } from '../../../utils/session-param'
import { buildSessionView } from '../../../utils/session-view'

/** セッションの全体像を返す。無い uuid は 404。 */
export default defineEventHandler(async (event): Promise<SessionView> => {
  const sessionId = await requireSessionId(event)
  return await buildSessionView(sessionId)
})
