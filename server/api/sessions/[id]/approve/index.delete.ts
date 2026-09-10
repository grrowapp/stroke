import { withdrawDecision } from '../../../../handler/approve'
import { conflict } from '../../../../utils/stroke/conflict'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'

/**
 * U10 の取り消し: 記録された承認の判断を取り下げる（openspec/specs/api/session/approve
 * 「記録した判断は、昇格の前なら取り消せる」）。
 *
 * **メソッドで振り分ける。** 同じ path `/api/sessions/:id/approve` を `POST`（判断）と
 * `DELETE`（取り消し）で分け、接尾辞なしの `index.ts` にはしない——Nitro がメソッドとして
 * 読むのはドットで続く接尾辞だけで、落とすと `GET` でも取り消しに到達する
 * （`sessions/[id]/index.get.ts`（U2）と `index.delete.ts`（U11）が同じ形）。
 *
 * 取り消すのは判断だけである。proposal・ストロークの往復の記録・ディレクトリの中身には
 * 触れない。判断が無ければ何も変えず、昇格が済んだ後は受理しない——そこから先は取り消しでは
 * なくプロジェクトの削除（`api/project/delete`）である。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)

  const state = await readState(sessionId)
  // 昇格後（`approved` / `activated`）は取り消しの対象ではない
  if (isPromotedState(state)) {
    throw conflict('phase', '昇格した後は取り消せない。プロジェクトの削除を使うこと。')
  }

  // 判断が無ければ何も変えない（`stroking` は判断を持ちえない）
  if (state.phase !== 'proposed' || state.decision === undefined) {
    return new Response(null, { status: 204 })
  }

  await withdrawDecision(sessionId, state)

  return new Response(null, { status: 204 })
})
