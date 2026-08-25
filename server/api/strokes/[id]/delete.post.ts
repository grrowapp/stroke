import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { isRunning } from '../../../utils/stroke/running'
import { deleteSessionCore } from '../../../utils/stroke/session-core'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { sessionErrorToHttp } from '../../../utils/stroke/session-store'
import { forgetSubmissions } from '../../../utils/stroke/submission-signal'

/**
 * U11: セッションを消す。消したときは、そのセッションに属するもの（セッションディレクトリ
 * 配下の状態・生成物・openspec の change）が残らない。実行中の呼び出しを持つ間は busy と
 * 同じ 409 で受理しない（specs/api/session）。
 *
 * **消せるのはセッションだけである。** 承認で昇格した対象（`phase: 'approved'`）は
 * もうセッションではなくプロジェクトなので受理しない。判定は `deleteSessionCore` が
 * 持つ——CLI（`yarn session delete`）も同じ core を通るので、endpoint 側にだけ置くと
 * 片方が素通しになる。
 */
export default defineEventHandler(async (event): Promise<null> => {
  const sessionId = await requireSessionId(event)

  if (isRunning(sessionId)) {
    throw conflict('busy', 'このセッションは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

  try {
    await deleteSessionCore(readStrokeConfig().projectShareRoot, sessionId)
  } catch (error) {
    throw sessionErrorToHttp(error)
  }
  // 消えたセッションの提出の記録も落とす（id が使い回されたときに前の分を数えない）。
  forgetSubmissions(sessionId)
  return null
})
