import type { SessionSummary } from '#shared/stroke'
import { listUnfinishedStrokes } from '../../../handler/session'
import { visibleSessions } from '../../../utils/access/request'
import { readStrokeConfig } from '../../../utils/stroke/config'

/**
 * U16: 中断したストローク——昇格前（`stroking` / `proposed`）のセッションを一覧する。
 *
 * 上層がここを読み、完全な失敗に達したセッションへの戻り道を出す
 * （`docs/specs/architecture/failure.md`「時間を置いて再開する」）。**U12 と母集合が違う。**
 * U12 は実行環境（openspec ルートとスキーマ設定）が揃ったものだけを載せ、初回の起動に失敗した
 * セッションは載らない。戻り道が要るのはまさにその対象なので、ここは `state.json` があることだけを見る。
 *
 * 返すのは、要求した利用者が見られるセッションだけである——始めた本人と管理者（`access/permission`）。
 */
export default defineEventHandler(async (event): Promise<SessionSummary[]> => {
  return visibleSessions(event, await listUnfinishedStrokes(readStrokeConfig().projectShareRoot))
})
