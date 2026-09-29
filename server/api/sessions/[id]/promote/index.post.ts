import { promote } from '../../../../handler/promote'
import { readStrokeConfig } from '../../../../utils/stroke/config'
import { conflict } from '../../../../utils/stroke/conflict'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * U14: 判断のあるセッションをプロジェクトへ昇格させる（openspec/specs/api/session/promote）。
 *
 * 承認（U10）・昇格（ここ）・steering の起動（U13）の真ん中の段。**判断を下すことも、
 * 起動を要求することも受け持たない。**
 *
 * **記録された判断が無ければ受理しない。** 承認はプロジェクト生成の唯一の引き金であり、
 * その関係はここで守られる。分岐ではなく責務の不成立である（ADR-0014 補足1）——
 * 「判断のあるセッションを昇格させる」が責務で、判断が無ければそれが成立しない。
 *
 * **本文を取らない。** 名前は判断が持つ。引数で受けると判断と違う名前で昇格できてしまう。
 *
 * 昇格の実処理——占有・衝突確認・改名・`phase` の書き込み・巻き戻し・判断の取り下げ・
 * 配信・A8 への引き渡し——は `handler/promote.ts` が持つ。ここが持つのは局面の述語
 * （昇格してよい局面か・判断が記録されているか）と、判断から名前を取り出して渡すことである。
 */
export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)

  const state = await readState(sessionId)
  // `approved` も `activated` も昇格済み。重ねての昇格は受理しない
  if (isPromotedState(state)) {
    throw conflict('phase', 'このセッションは既に昇格している。')
  }
  if (state.phase !== 'proposed' || state.decision === undefined) {
    throw conflict('phase', '承認の判断が記録されていない。先に承認すること。')
  }

  await promote(readStrokeConfig().projectShareRoot, sessionId, state.decision.projectName)

  return new Response(null, { status: 204 })
})
