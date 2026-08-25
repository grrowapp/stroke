import { defineNitroPlugin } from 'nitropack/runtime'

import { readStrokeConfig } from '../utils/stroke/config'
import { invokePath } from '../utils/stroke/invoke'
import { LOG_PREFIX } from '../utils/stroke/log'
import { listSessionsCore } from '../utils/stroke/session-core'
import { shouldRetry } from '../utils/stroke/sweep'

/**
 * 失敗した実行を起こし直す巡回（openspec/specs/portal/batch）。
 *
 * 一覧（U12 の実体）から `invocation === 'failed'` の件**だけ**を取り、その `path` を
 * cwd に添えて自身の U13 を叩く。**他の判定を持たない。**
 *
 * - `running` の時間切れ判定は invokeAi の責務（プロセス内の見張り）。落ちて残った
 *   `running` は起動時の `01.reap-running` が `failed` へ倒すので、そこで拾われる
 * - `idle` にはやり直すものが無い
 * - `error` はリトライ上限に達した終端で、ユーザーへ引き渡す
 *
 * 上限判定も定型の選択も invokeAi が行う。cwd も自分で組み立てない——一覧が返した
 * `path` をそのまま渡す（design.md D5）。
 */

/** 巡回の間隔。設定ではない（docs/specs/core/settings-reference.md）。 */
const SWEEP_INTERVAL_MS = 60_000

export default defineNitroPlugin((nitro) => {
  let root: string
  try {
    root = readStrokeConfig().projectShareRoot
  } catch {
    // 設定が壊れているなら起動時チェック（00.startup-checks）が伝える。巡回は張らない。
    return
  }

  const sweep = async (): Promise<void> => {
    for (const session of await listSessionsCore(root)) {
      if (!shouldRetry(session.invocation)) continue

      try {
        await $fetch(invokePath(session.id, session.path))
      } catch (error) {
        // 起こし直せなかった件は次の巡回で拾う。1件で全体を止めない。
        console.warn(`${LOG_PREFIX} 再キックに失敗: ${session.id}`, error)
      }
    }
  }

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)

  nitro.hooks.hook('close', () => {
    clearInterval(timer)
  })
})
