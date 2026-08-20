import { requireSessionId } from '../../utils/session-param'
import { readOverview } from '../../utils/session-store'

/** A1: 概要を取得する。U1 で投稿された概要の全文。 */
export default defineEventHandler(async (event): Promise<{ overview: string }> => {
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
