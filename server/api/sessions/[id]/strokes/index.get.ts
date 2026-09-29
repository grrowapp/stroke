import type { Stroke } from '#shared/stroke'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { readStrokes } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * U3: 済んだストロークの全件を見る。画面はパンくずと粒開きに、エージェントは resume 起動時に
 * 末尾要素の `answer` を直前の回答として読む。
 */
export default defineEventHandler(async (event): Promise<{ strokes: Stroke[] }> => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const strokes = await readStrokes(sessionId)
  return { strokes }
})
