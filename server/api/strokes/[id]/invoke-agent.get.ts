import { missingPrerequisites } from '../../../utils/readiness'
import { readStrokeConfig } from '../../../utils/stroke/config'
import { kick } from '../../../utils/stroke/invoke'
import { LOG_PREFIX } from '../../../utils/stroke/log'
import { sessionDir } from '../../../utils/stroke/paths'
import { beginRun, endRun } from '../../../utils/stroke/running'
import { requireSessionId } from '../../../utils/stroke/session-param'
import { readState } from '../../../utils/stroke/session-store'

/**
 * U13: AI を起動する唯一の入口（specs/api/invoke-agent）。受理系 endpoint は起動を
 * 持たず、フロントが受理の成功応答の直後にここを GET で呼ぶ（design.md 決定6）。
 *
 * **応答は受理で即完結する。** `running` 化・起動・完了検知・タイムアウト・上限判定は
 * すべて非同期の invokeAi が担い、応答はそれを待たない
 * （openspec/specs/agent/invocation）。
 *
 * **cwd はクエリ `cwd` で受け取る。** endpoint が自分で導出しない
 * （openspec/specs/api/session/invoke-agent・design.md D5）。渡されなければセッション
 * ディレクトリを既定にする——昇格前のストロークはそれで足りるためで、昇格後の対象と
 * 巡回の再キックは呼び出し側が path を添える。
 *
 * クエリ `reset` はユーザーの再実行。リトライ回数を戻してから起こす。**`invocation` を
 * 画面が直接書かない**ため（A8 を叩けるのは invokeAi だけ）、回数のリセットもここで行う。
 *
 * 承認済み（`approved`）でも受け付ける。昇格したプロジェクトでは steering の実行が
 * 起こるためで、渡す定型と cwd だけが変わる。
 */
export default defineEventHandler(async (event) => {
  const sessionId = await requireSessionId(event)

  // 前提が欠けている間は起動を受け付けない（specs/api/invoke-agent）。判定はここで行い、
  // 起動時の結果を持ち越さない（design.md 決定2）。409 とは別にする: 画面は 409 を
  // 「待てば通る」と読むが（utils/conflict）、こちらは環境か設定を直すまで通らない。
  const missing = await missingPrerequisites()
  if (missing.length > 0) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: `AI を起動できる状態にない: ${missing.join(' / ')}`,
    })
  }

  const state = await readState(sessionId)

  // busy ガード。多重起動はここで止める（specs/api/invoke-agent）。
  beginRun(sessionId)

  const query = getQuery(event)
  const cwd = typeof query.cwd === 'string' && query.cwd.trim() !== ''
    ? query.cwd
    : sessionDir(readStrokeConfig().projectShareRoot, sessionId)

  // 承認後の対象は steering、それ以外はストロークの往復。渡す値だけが違う。
  const kind = state.phase === 'approved' ? 'steering' : 'stroke'

  // `reset` はユーザーの再実行。リトライ回数を戻してから起こす
  // （openspec/specs/agent/invocation「ユーザーが再実行する」）。巡回は付けない。
  const retries = query.reset === undefined ? (state.retries ?? 0) : 0

  kick({
    sessionId,
    cwd,
    kind,
    retries,
    runId: state.phase === 'approved' ? state.runId : undefined,
  })
    .catch((error) => {
      console.error(`${LOG_PREFIX} AI 呼び出しの管理に失敗: ${sessionId}`, error)
    })
    .finally(() => endRun(sessionId))

  setResponseStatus(event, 200)
  return null
})
