import { recordDecision, type DecisionRefusal } from '../../../../handler/approve'
import { readStrokeConfig } from '../../../../utils/stroke/config'
import { conflict } from '../../../../utils/stroke/conflict'
import { approveBody, parseBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'
import { requireSession } from '../../../../utils/access/request'

/**
 * U10: 承認の判断を受理して記録する（openspec/specs/api/session/approve）。
 *
 * **承認は昇格の唯一の引き金である。** ただし引き金であることと、同じ呼び出しの中で全部を
 * 走らせることは別で、ここは判断を記録するだけである——**改名しない・`phase` を動かさない・
 * 起動しない**。昇格は判断が記録されているときにだけ U14（`promote/index.post.ts`）が行い、
 * steering の起動は昇格の成功を見た側が U13 に要求する。
 *
 * 判断が記録されている間もセッションはセッションのままで（`phase: 'proposed'`）、
 * プロジェクト一覧には生成中としても現れない。取り下げは `DELETE`（`approve/index.delete.ts`）。
 *
 * proposal はセッションの時点から `docs/proposal.md` に在り（受理の時点で A7 が残す）、
 * **承認は proposal を書かず、既にあるものに触れない。**
 *
 * busy ガードは U7・U9 のみ（design.md ガードの語彙）。承認はエージェントの呼び出しを
 * 起動しないため対象にしない。
 *
 * 記録の実処理は `handler/approve.ts`。ここが持つのは局面の述語と、受理しなかった理由を
 * 409 へ写すことである。
 */

/** 記録が成立しなかったときの文言。理由ごとに1つ */
const REFUSAL_MESSAGE: Record<DecisionRefusal, string> = {
  'no-proposal': '承認する proposal が見つからない。',
  'already-decided': '承認の判断は既に記録されている。取り下げてから下し直すこと。',
}

export default defineEventHandler(async (event) => {
  // 見られない対象は存在しないものとして 404（access/permission）
  await requireSession(event, getRouterParam(event, 'id') ?? '')
  const sessionId = await requireSessionId(event)
  const { projectName } = parseBody(approveBody, await readBody(event))

  const state = await readState(sessionId)
  // 昇格後（`approved` / `activated`）はもうプロジェクト。判断を下し直す対象ではない
  if (isPromotedState(state)) {
    throw conflict('phase', 'このセッションは既に承認済み。')
  }
  if (state.phase !== 'proposed') {
    throw conflict('phase', '承認できるのは proposal が出ているときだけ。')
  }

  const recorded = await recordDecision(
    readStrokeConfig().projectShareRoot,
    sessionId,
    state,
    projectName,
  )
  if (!recorded.ok) {
    throw conflict('phase', REFUSAL_MESSAGE[recorded.reason])
  }

  return new Response(null, { status: 204 })
})
