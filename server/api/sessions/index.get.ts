import type { SessionSummary } from '#shared/stroke'
import { readStrokeConfig } from '../../utils/stroke/config'
import { listSessionsCore } from '../../utils/stroke/session-core'

/**
 * U12: 残っているセッションを一覧する。各件は id・phase・時点情報（`state.json` の mtime）。
 * 何が残っているか分からなければ消す判断ができない（specs/api/session）。
 */
export default defineEventHandler(async (): Promise<SessionSummary[]> => {
  return listSessionsCore(readStrokeConfig().projectShareRoot)
})
