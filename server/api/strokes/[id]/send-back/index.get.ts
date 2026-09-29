import type { SendBackPayload } from '#shared/stroke'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { readSendBack } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/** A4: 差し戻しの指摘一式を取得する。まだ差し戻しが無ければ 404。 */
export default defineEventHandler(async (event): Promise<SendBackPayload> => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
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
