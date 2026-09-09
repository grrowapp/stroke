import { readStrokeConfig } from '../../../../utils/stroke/config'
import { conflict } from '../../../../utils/stroke/conflict'
import { assertNameAvailable } from '../../../../utils/stroke/project'
import { approveBody, parseBody } from '../../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState, sessionProposal, withDecision, writeState } from '../../../../utils/stroke/session-store'

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
 */
export default defineEventHandler(async (event) => {
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

  // 判断の対象となる proposal が残っていなければ受理しない。A7 は残せたときだけ受理を
  // 成立させるので、`proposed` に進んだセッションでは通常ここを通る。通らないのは外から
  // 消された場合で、そのときはセッションを `proposed` のまま残す。
  if ((await sessionProposal(sessionId).read()) === undefined) {
    throw conflict('phase', '承認する proposal が見つからない。')
  }

  // 重ねて判断を下すことは受理しない。取り下げてから下し直す（`DELETE`）。
  if (state.decision !== undefined) {
    throw conflict('phase', '承認の判断は既に記録されている。取り下げてから下し直すこと。')
  }

  // 衝突は昇格の直前にも確認されるが（U14）、判断の時点で分かるものはその場で伝える。
  // 何も動かさずに 409 で、セッションは `proposed` のまま残る。
  await assertNameAvailable(readStrokeConfig().projectShareRoot, projectName)

  // 判断を記録する。`withDecision` は `proposed` を受けて `proposed` を返すので、
  // ここで `phase` が動くことはない。書けなければ失敗が返り、判断は記録されない。
  await writeState(sessionId, withDecision(state, { projectName }))

  return new Response(null, { status: 204 })
})
