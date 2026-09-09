import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { activateApproved, activateResultOf, type ActivateCounts } from '../utils/stroke/activate-approved'
import { LOG_PREFIX } from '../utils/stroke/log'
import { activatePath } from '../utils/stroke/submission-path'

/**
 * 起動時の書き上げ（openspec/specs/project/generation「既に完成しているプロジェクトは
 * 起動時に完成を記録し直す」）。**起動のたびに1回だけ**走る、専用のプラグイン。
 *
 * 完成の記録（`activated`）の導入前に昇格したプロジェクトのうち、**生成を終えていたもの**
 * ——`approved` かつ実行の記録が `idle`——を `activated` に書き上げる。対象の選び方は
 * 一覧（U12）が返す state だけで決まり、ファイルシステムは見ない
 * （`server/utils/stroke/activate-approved.ts`）。U15 は判定を持たない（ADR-0014）。
 * `activated` になった対象は次の起動で `approved` として出てこないので、2回目以降は
 * 何もしない。
 *
 * 後始末（`01.reap-running.ts`）・巡回（`01.retry-failed.ts`）との順序の取り決めは持たない。
 * 同じ対象の `state.json` に同時に触れうるが、読んで書くの2手は `session-store.ts` の
 * `withStateLock` がセッション単位で直列化するので、古い写しで互いを上書きしない
 * （add-activated-phase design D9）。
 *
 * **参照は API の応答から得て、書き込みも API（U15）を通す**（`01.reap-running.ts` と同じ）。
 */
export default defineNitroPlugin(() => {
  void activate().catch((error) => {
    console.error(`${LOG_PREFIX} 起動時の書き上げに失敗した`, error)
  })
})

async function activate(): Promise<void> {
  let sessions: SessionSummary[]
  try {
    sessions = await $fetch<SessionSummary[]>('/api/strokes')
  } catch (error) {
    console.warn(`${LOG_PREFIX} 起動時の書き上げ: 一覧を取れない。今回は何もしない`, error)
    return
  }

  const counts = await activateApproved(sessions, {
    activate: async (sessionId) => {
      try {
        await $fetch(activatePath(sessionId), { method: 'POST' })
        return 'activated'
      } catch (error) {
        return activateResultOf(error)
      }
    },
  })

  logCounts(counts)
}

function logCounts(counts: ActivateCounts): void {
  if (counts.activated === 0 && counts.notYet === 0 && counts.failed === 0) return
  console.warn(
    `${LOG_PREFIX} 起動時の書き上げ: `
    + `activated にした ${counts.activated} 件・生成中のまま ${counts.notYet} 件・`
    + `記録できなかった ${counts.failed} 件`,
  )
}
