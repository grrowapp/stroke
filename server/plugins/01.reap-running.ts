import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { beginReap } from '../utils/stroke/reap-gate'
import { LOG_PREFIX } from '../utils/stroke/log'
import { readStrokeConfig } from '../utils/stroke/config'
import { listLiveProcesses } from '../utils/stroke/live-processes'
import { reapRunning, terminateProcess, type ReapCounts } from '../utils/stroke/reap'
import { submissionPath } from '../utils/stroke/submission-path'

/**
 * 起動時の後始末（`fix-orphan-run-on-restart`）。**起動のたびに1回だけ**走る、専用の
 * プラグイン（design.md Decision 3「後始末を巡回から切り出し、起動時の専用ステップに
 * する」）。
 *
 * 前のプロセスが残した `running` を、生きている claude の有無で判定して倒す
 * （判定・分岐そのものは `server/utils/stroke/reap.ts`）。巡回プラグイン
 * （`server/plugins/01.retry-failed.ts`）は、この完了を `reap-gate.ts` の門で待ってから
 * 最初の周回を始める——後始末より先に起こし直すと、まだ生きている claude と2つ目が
 * 並びかねない（openspec/specs/agent/invocation「後始末より先に起こし直さない」）。
 *
 * **参照は API の応答から得て、書き込みは A8 を通す**（openspec/specs/agent/invocation
 * の MUST NOT: ファイルを直接読んで実行状態を判定してはならない）。
 */
export default defineNitroPlugin(() => {
  const task = reap().catch((error) => {
    // ここまで来たら reapRunning 自体が想定外の形で落ちている（`listProcesses` /
    // `writeInvocation` は自分で失敗を握りつぶす作りなので、通常はここに来ない）。
    // 後始末が失敗して終わっても巡回は止めない（tasks 3.2）——`beginReap` へ渡す
    // Promise は reject させたまま `reap-gate.ts` 側で握りつぶしてもらう。
    console.error(`${LOG_PREFIX} 起動時の後始末に失敗した。巡回は後始末が済んだものとして進める`, error)
    throw error
  })

  // reject する可能性を持つ Promise は、拾い手が付く前の一瞬に unhandledRejection として
  // 騒がれないための保険。上の `.catch` でログは出し終えているので、ここでは握りつぶすだけ
  task.catch(() => {})

  beginReap(task)
})

async function reap(): Promise<void> {
  const apiBaseUrl = readStrokeConfig().claude.apiBaseUrl

  let sessions: SessionSummary[]
  try {
    sessions = await $fetch<SessionSummary[]>('/api/strokes')
  } catch (error) {
    console.warn(`${LOG_PREFIX} 起動時の後始末: 一覧を取れない。今回は何もしない`, error)
    return
  }

  const counts = await reapRunning(sessions, {
    listProcesses: listLiveProcesses,
    apiBaseUrl,
    terminate: terminateProcess,
    writeInvocation: async (sessionId, invocation) => {
      await $fetch(submissionPath(sessionId), { method: 'POST', body: { invocation } })
    },
  })

  logCounts(counts)
}

function logCounts(counts: ReapCounts): void {
  if (counts.killed === 0 && counts.failed === 0 && counts.errored === 0 && counts.skipped === 0) return
  console.warn(
    `${LOG_PREFIX} 起動時の後始末: `
    + `止めた ${counts.killed} 件・failed にした ${counts.failed} 件・`
    + `error にした ${counts.errored} 件・触らなかった ${counts.skipped} 件`,
  )
}
