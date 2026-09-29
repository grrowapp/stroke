import { settle } from '../../../../handler/settlement'
import { conflict } from '../../../../utils/stroke/conflict'
import { parseBody, settlementBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * A9: 実行の決着。その実行で提出されたものに応じて局面を切り替え、画面へ届ける。
 *
 * **叩くのは invoke-agent だけである**（openspec/specs/agent/invocation）。claude（エージェント）と
 * 画面は叩かない。提出を受ける口（A5・A7）は記録だけを行い、ここが局面と配信を持つ。
 *
 * ここが持つのは**受け付けるかどうか**までである——引数が読み取れるか（400）と、決着してよい
 * 局面か（409）。局面を切り替えることと配信することは `handler/settlement.ts` が持つ。
 */
export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const { submitted } = parseBody(settlementBody, await readBody(event))

  const state = await readState(sessionId)
  // 昇格後（`approved` / `activated`）の実行は steering で、決着を持たない
  // （完成の記録は U15）。ストロークの局面だけがここを通る。
  if (isPromotedState(state)) {
    throw conflict('phase', '昇格した対象にストロークの決着は無い。')
  }

  if (!(await settle(sessionId, state, submitted))) {
    // 提出が受理されていれば本文は残っている（A7 は残せなければ受理しない）。無いなら
    // 決着の前提が成り立たないので、局面を動かさずに断る。起動し直しの対象になる
    throw conflict('phase', '残っている proposal が無い。')
  }

  return new Response(null, { status: 204 })
})
