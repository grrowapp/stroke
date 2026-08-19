import type { ApproveResult } from '#shared/types'
import { conflict } from '../../../utils/conflict'
import { generateProject } from '../../../utils/project'
import { approveBody, parseBody } from '../../../utils/request-schemas'
import { beginRun, endRun } from '../../../utils/running'
import { requireSessionId } from '../../../utils/session-param'
import { readProposal, readState, writeState } from '../../../utils/session-store'

/**
 * 承認してプロジェクトを生成する。承認はプロジェクト生成の唯一の引き金。
 *
 * 生成が成功したときだけ phase を `approved` にする。衝突（409）でも失敗でも phase は
 * `proposed` のままで、同じ操作をやり直せる。セッションディレクトリは承認後も削除しない。
 */
export default defineEventHandler(async (event): Promise<ApproveResult> => {
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

  beginRun(sessionId)
  try {
    // 衝突確認と生成は generateProject の中。既にあれば何も書かずに 409。
    await generateProject(projectName, proposal)
    await writeState(sessionId, { phase: 'approved', projectName })
    return { phase: 'approved' }
  } finally {
    endRun(sessionId)
  }
})
