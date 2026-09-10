import { InvokeError, invokeAgent } from '../../../../handler/invoke-agent'
import { missingPrerequisites } from '../../../../utils/readiness'
import { readStrokeConfig } from '../../../../utils/stroke/config'
import { sessionDir } from '../../../../utils/stroke/paths'
import { requireSessionId } from '../../../../utils/stroke/session-param'
import { isPromotedState, readState } from '../../../../utils/stroke/session-store'

/**
 * U13: AI を起動する唯一の入口（specs/api/invoke-agent）。受理系 endpoint は起動を
 * 持たず、フロントが受理の成功応答の直後にここを GET で呼ぶ（design.md 決定6）。
 *
 * **応答は起動の材料を組み立てられたかまでで完結する。** `running` 化・起動・完了検知・
 * タイムアウト・上限判定は非同期の invokeAi が担い、応答は AI の応答の完了を待たない
 * （openspec/specs/agent/invocation）。組み立てに失敗したときだけは別で、その失敗は
 * 待って 503 を返す——受理せずに終わったことを呼び出し側（画面・巡回・承認処理）が
 * 応答から知れるようにするためである
 * （fix-idle-stuck-on-run-build-failure・openspec/specs/api/session/invoke-agent）。
 * 占有と後始末を含む起動そのものは `handler/invoke-agent.ts` が持つ。
 *
 * **cwd はクエリ `cwd` で受け取る。** endpoint が自分で導出しない
 * （openspec/specs/api/session/invoke-agent・design.md D5）。渡されなければセッション
 * ディレクトリを既定にする——昇格前のストロークはそれで足りるためで、昇格後の対象と
 * 巡回の再キックは呼び出し側が path を添える。
 *
 * クエリ `reset` はユーザーの再実行。リトライ回数を戻してから起こす。**`invocation` を
 * 画面が直接書かない**ため（A8 を叩けるのは invokeAi だけ）、回数のリセットもここで行う。
 *
 * 承認以降（`approved` / `activated`）でも受け付ける。昇格したプロジェクトでは steering の
 * 実行が起こるためで、渡す定型と cwd だけが変わる。**どの定型にするか・完成の記録を試みるか
 * は phase から `invoke.ts` が導く。** ここは phase を渡すだけで判定を持たない
 * （add-activated-phase design D4）。
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

  const query = getQuery(event)
  const cwd = typeof query.cwd === 'string' && query.cwd.trim() !== ''
    ? query.cwd
    : sessionDir(readStrokeConfig().projectShareRoot, sessionId)

  // `reset` はユーザーの再実行。リトライ回数を戻してから起こす
  // （openspec/specs/agent/invocation「ユーザーが再実行する」）。巡回は付けない。
  const retries = query.reset === undefined ? (state.retries ?? 0) : 0

  try {
    await invokeAgent({
      sessionId,
      cwd,
      phase: state.phase,
      retries,
      // 会話の続き先を持つのは昇格後の対象だけ
      runId: isPromotedState(state) ? state.runId : undefined,
    })
  } catch (error) {
    if (error instanceof InvokeError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        message: error.message,
      })
    }
    throw error
  }

  setResponseStatus(event, 200)
  return {}
})
