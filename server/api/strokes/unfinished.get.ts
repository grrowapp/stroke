import type { SessionSummary } from '#shared/stroke'
import { readStrokeConfig } from '../../utils/stroke/config'
import { listUnfinishedStrokes } from '../../utils/stroke/unfinished'

/**
 * U16: 中断したストローク——昇格前（`stroking` / `proposed`）のセッションを一覧する。
 *
 * 上層がここを読み、完全な失敗に達したセッションへの戻り道を出す
 * （`docs/specs/architecture/failure.md`「時間を置いて再開する」）。**U12 と母集合が違う。**
 * U12 は実行環境（openspec ルートとスキーマ設定）が揃ったものだけを載せ、初回の起動に失敗した
 * セッションは載らない。戻り道が要るのはまさにその対象なので、ここは `state.json` があることだけを見る。
 */
export default defineEventHandler(async (): Promise<SessionSummary[]> => {
  return listUnfinishedStrokes(readStrokeConfig().projectShareRoot)
})
