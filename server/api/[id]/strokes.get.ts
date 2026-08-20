import type { Stroke } from '#shared/types'
import { requireSessionId } from '../../utils/session-param'
import { readStrokes } from '../../utils/session-store'

/**
 * U3: 済んだストロークの全件を見る。画面はパンくずと粒開きに、エージェントは resume 起動時に
 * 末尾要素の `answer` を直前の回答として読む。
 */
export default defineEventHandler(async (event): Promise<{ strokes: Stroke[] }> => {
  const sessionId = await requireSessionId(event)
  const strokes = await readStrokes(sessionId)
  return { strokes }
})
