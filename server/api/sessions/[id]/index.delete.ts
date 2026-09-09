import type { Phase } from '#shared/stroke'
import { deleteSession } from '../../../handler/session'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { conflict, deleteErrorToHttp } from '../../../utils/stroke/conflict'
import { isRunning, sessionRunPath } from '../../../utils/stroke/running'
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
 * 実行中の呼び出しを持つ間は busy と同じ 409 で受理しない。**判定の単位は起動（U13）・
 * プロジェクトの削除（P1）・承認（U10）と同じ1つの事実（作業場所ディレクトリの実体）**
 * ——単位の定義は `running.ts` に集約してあり、口ごとに数え直さない
 * （fix-rename-during-running-session）。
 */

/** この口が消してよい局面。承認より前だけ */
const DELETABLE: readonly Phase[] = ['stroking', 'proposed']

export default defineEventHandler(async (event): Promise<Response> => {
  // 存在確認を先にする（404）。busy 判定は対象の作業場所を `stat` するため、無い対象に
  // 対しては「無い」を先に伝える——「消せない」（409）ではない。
  const sessionId = await requireSessionId(event)
  const root = readStrokeConfig().projectShareRoot

  if (await isRunning(sessionRunPath(root, sessionId))) {
    throw conflict('busy', 'このセッションは AI の応答を待っている。完了するまで削除は受け付けない。')
  }

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
