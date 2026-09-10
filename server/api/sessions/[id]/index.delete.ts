import type { Phase } from '#shared/stroke'
import { deleteSession } from '../../../handler/session'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict, deleteErrorToHttp } from '../../../utils/stroke/conflict'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState, type SessionState } from '../../../utils/stroke/session-store'

/**
 * U11: セッションを消す（`openspec/specs/api/session/delete`）。
 *
 * **メソッドで振り分ける。** パスに `delete` という動詞を置かず、`DELETE /api/sessions/:id`
 * とする。メソッドを絞らない handler にすると、削除が `GET` でも到達できてしまう。
 *
 * **消せるのは承認より前のものだけである。** 承認で昇格した対象はもうプロジェクトなので、
 * ここでは受理しない——プロジェクトの削除が扱う。**どの局面を許すかはこの endpoint が
 * 自分の literal で持ち**（下の `DELETABLE`）、消す実行（`handler/session.ts` →
 * `handler/delete.ts`）は判定を持たない（add-activated-phase design D5）。
 *
 * phase は `readState`（zod）で読む。**壊れた `state.json` は消さない**——読めないものを
 * 「許す」に倒すと、壊れた `state.json` を持つ本物のプロジェクトが消せてしまう。
 *
 * **実行中かどうかを見ない。** 画面が削除の操作を出す局面（`error` からの回復・初回起動の
 * 失敗からの回復）は、いずれも実行が終わった後である。実行中に削除が届くことは無いので、
 * 「実行中だから受理しない」（busy）という応答を持たない
 * （openspec/specs/api/session/delete。change fix-rename-during-running-session）。
 */

/** この口が消してよい局面。承認より前だけ */
const DELETABLE: readonly Phase[] = ['stroking', 'proposed']

export default defineEventHandler(async (event): Promise<Response> => {
  const sessionId = await requireSessionId(event)
  const root = readStrokeConfig().projectShareRoot

  let state: SessionState
  try {
    state = await readState(sessionId)
  } catch {
    throw conflict('phase', 'state.json を読めない。分からないものは消さない。')
  }

  if (!DELETABLE.includes(state.phase)) {
    throw conflict('phase', '承認済みのものはここでは消せない。プロジェクトの削除を使うこと。')
  }

  try {
    // 消す実行も、消えた id の提出の記録の後始末も handler が持つ
    await deleteSession(root, sessionId)
  } catch (error) {
    throw deleteErrorToHttp(error)
  }

  return new Response(null, { status: 204 })
})
