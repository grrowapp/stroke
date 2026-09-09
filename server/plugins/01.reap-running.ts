import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { LOG_PREFIX } from '../utils/stroke/log'
import { listLiveProcesses } from '../utils/stroke/live-processes'
import { reapRunning, terminateProcess, type ReapCounts } from '../utils/stroke/reap'
import { submissionPath } from '../utils/stroke/submission-path'

/**
 * 起動時の後始末（openspec/specs/bootstrap/system/cleanup-agent-process）。
 * **起動のたびに1回だけ**走る、専用のプラグイン。後始末を巡回から切り出し、起動時の
 * 専用ステップに置く。
 *
 * 前のプロセスが残した `running` を、生きている claude の有無で判定し、**終了させてから**
 * 倒す（判定・分岐そのものは `server/utils/stroke/reap.ts`）。巡回プラグイン
 * （`server/plugins/01.retry-failed.ts`）との間に、呼び出し順序の取り決めは持たない——
 * 対象1件ごとの順序（終了を確かめてから `failed` を書く）だけで二重起動は防げている。
 *
 * **参照は API の応答から得て、書き込みは A8 を通す**（openspec/specs/agent/invocation
 * の MUST NOT: ファイルを直接読んで実行状態を判定してはならない）。
 */
export default defineNitroPlugin(() => {
  void reap().catch((error) => {
    // ここまで来たら reapRunning 自体が想定外の形で落ちている（`listProcesses` /
    // `writeInvocation` は自分で失敗を握りつぶす作りなので、通常はここに来ない）。
    console.error(`${LOG_PREFIX} 起動時の後始末に失敗した`, error)
  })
})

async function reap(): Promise<void> {
  let sessions: SessionSummary[]
  try {
    sessions = await $fetch<SessionSummary[]>('/api/sessions')
  } catch (error) {
    console.warn(`${LOG_PREFIX} 起動時の後始末: 一覧を取れない。今回は何もしない`, error)
    return
  }

  const counts = await reapRunning(sessions, {
    listProcesses: listLiveProcesses,
    terminate: terminateProcess,
    writeInvocation: async (sessionId, invocation) => {
      await $fetch(submissionPath(sessionId), { method: 'POST', body: { invocation } })
    },
  })

  logCounts(counts)
}

function logCounts(counts: ReapCounts): void {
  if (counts.killed === 0 && counts.failed === 0 && counts.errored === 0) return
  console.warn(
    `${LOG_PREFIX} 起動時の後始末: `
    + `止めた ${counts.killed} 件・failed にした ${counts.failed} 件・`
    + `error にした ${counts.errored} 件`,
  )
}
