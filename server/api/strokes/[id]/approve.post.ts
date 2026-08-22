import { conflict } from '../../../utils/stroke/conflict'
import { generateProject } from '../../../utils/stroke/project'
import { approveBody, parseBody } from '../../../utils/stroke/request-schemas'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readProposal, readState, writeState } from '../../../utils/stroke/session-store'

/**
 * U10: 承認してプロジェクトを生成する。承認はプロジェクト生成の唯一の引き金。
 *
 * busy ガードは U7・U9 のみ（design.md ガードの語彙）。承認はエージェントの呼び出しを
 * 起動しないため対象にしない。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)
  const { projectName } = parseBody(approveBody, await readBody(event))

  const state = await readState(sessionId)
  if (state.phase === 'approved') {
    throw conflict('phase', 'このセッションは既に承認済み。')
  }
  if (state.phase !== 'proposed') {
    throw conflict('phase', '承認できるのは proposal が出ているときだけ。')
  }

  const proposal = await readProposal(sessionId)
  if (proposal === undefined) {
    throw conflict('phase', '承認する proposal が見つからない。')
  }

  // 衝突確認と生成は generateProject の中。既にあれば何も書かずに 409。
  await generateProject(projectName, proposal)
  await writeState(sessionId, { phase: 'approved', projectName })

  setResponseStatus(event, 200)
  return null
})
