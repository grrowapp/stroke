import type { SessionSummary } from '#shared/stroke'
import { listSessions } from '../../handler/session'
import { readStrokeConfig } from '../../utils/stroke/config'

/**
 * U12: 残っているセッションを一覧する。各件は id・phase・時点情報（`state.json` の mtime）。
 * 何が残っているか分からなければ消す判断ができない（specs/api/session）。
 */
export default defineEventHandler(async (): Promise<SessionSummary[]> => {
  return listSessions(readStrokeConfig().projectShareRoot)
})
