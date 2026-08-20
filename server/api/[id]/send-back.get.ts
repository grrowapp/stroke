import type { SendBackPayload } from '#shared/types'
import { requireSessionId } from '../../utils/session-param'
import { readSendBack } from '../../utils/session-store'

/** A4: 差し戻しの指摘一式を取得する。まだ差し戻しが無ければ 404。 */
export default defineEventHandler(async (event): Promise<SendBackPayload> => {
  const sessionId = await requireSessionId(event)
  const payload = await readSendBack(sessionId)
  if (payload === undefined) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: '差し戻しはまだ無い。',
    })
  }
  return payload
})
