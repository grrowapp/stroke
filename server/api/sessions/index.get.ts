import type { SessionSummary } from '#shared/stroke'
import { listSessions } from '../../handler/session'
import { visibleSessions } from '../../utils/access/request'
import { readStrokeConfig } from '../../utils/stroke/config'

/**
 * U12: 残っているセッションを一覧する。各件は id・phase・時点情報（`state.json` の mtime）。
 * 何が残っているか分からなければ消す判断ができない（specs/api/session）。
 *
 * 載せるのは、要求した利用者が見られるセッションとプロジェクトだけである（`api/session/list`）。
 * 巡回などサーバー内部の呼び出しには全件が返る。
 */
export default defineEventHandler(async (event): Promise<SessionSummary[]> => {
  return visibleSessions(event, await listSessions(readStrokeConfig().projectShareRoot))
})
