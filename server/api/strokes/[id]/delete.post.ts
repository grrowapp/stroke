import { conflict } from '../../../utils/stroke/conflict'
import { isRunning } from '../../../utils/stroke/running'
import { deleteSessionCore } from '../../../utils/stroke/session-core'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { sessionErrorToHttp } from '../../../utils/stroke/session-store'

/**
 * U11: セッションを消す。消したときは、そのセッションに属するもの（セッションディレクトリ
 * 配下の状態・生成物・openspec の change）が残らない。実行中の呼び出しを持つ間は busy と
 * 同じ 409 で受理しない（specs/api/session）。
 */
export default defineEventHandler(async (event): Promise<null> => {
  const sessionId = await requireSessionId(event)

  if (isRunning(sessionId)) {
    throw conflict('busy', 'このセッションは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

  try {
    await deleteSessionCore(sessionId)
  } catch (error) {
    throw sessionErrorToHttp(error)
  }
  return null
})
