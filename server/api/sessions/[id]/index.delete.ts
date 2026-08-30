import { DeleteError, removeTarget } from '../../../handler/delete'
import { isBeforeApproval, readPhase } from '../../../handler/phase'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict } from '../../../utils/stroke/conflict'
import { isRunning } from '../../../utils/stroke/running'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { forgetSubmissions } from '../../../utils/stroke/submission-signal'

/**
 * U11: セッションを消す（`openspec/specs/api/session/delete`）。
 *
 * **メソッドで振り分ける。** パスに `delete` という動詞を置かず、`DELETE /api/sessions/:id`
 * とする。メソッドを絞らない handler にすると、削除が `GET` でも到達できてしまう。
 *
 * **消せるのは承認より前のものだけである。** 承認で昇格した対象はもうプロジェクトなので、
 * ここでは受理しない——プロジェクトの削除が扱う。この判定は endpoint が持ち、消す動作
 * （`handler/delete`）は判定を持たない。
 *
 * 実行中の呼び出しを持つ間は busy と同じ 409 で受理しない。
 */
export default defineEventHandler(async (event): Promise<null> => {
  const sessionId = await requireSessionId(event)
  const root = readStrokeConfig().projectShareRoot

  if (isRunning(sessionId)) {
    throw conflict('busy', 'このセッションは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

  const phase = await readPhase(root, sessionId)
  if (phase === null) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: `そのセッションは無い: ${sessionId}`,
    })
  }
  if (!isBeforeApproval(phase)) {
    throw conflict('phase', '承認済みのものはここでは消せない。プロジェクトの削除を使うこと。')
  }

  try {
    await removeTarget(root, sessionId)
  } catch (error) {
    throw toHttp(error)
  }

  // 消えたセッションの提出の記録も落とす（id が使い回されたときに前の分を数えない）
  forgetSubmissions(sessionId)
  return null
})

function toHttp(error: unknown) {
  if (error instanceof DeleteError && error.kind === 'not-found') {
    return createError({ statusCode: 404, statusMessage: 'Not Found', message: error.message })
  }
  return createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message: error instanceof Error ? error.message : String(error),
  })
}
