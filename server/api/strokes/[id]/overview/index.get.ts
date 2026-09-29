import { requireSessionId } from '../../../../utils/stroke/session-param'
import { readOverview } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/** A1: 概要を取得する。U1 で投稿された概要の全文。 */
export default defineEventHandler(async (event): Promise<{ overview: string }> => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const overview = await readOverview(sessionId)
  if (overview === undefined) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: '概要がまだ無い。',
    })
  }
  return { overview }
})
