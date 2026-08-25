import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { invokePath, submissionPath } from '../utils/stroke/invoke'
import { LOG_PREFIX } from '../utils/stroke/log'
import { shouldRetry } from '../utils/stroke/sweep'

/**
 * 失敗した実行を起こし直す巡回（openspec/specs/portal/batch）。
 *
 * 一覧（U12）から `invocation === 'failed'` の件**だけ**を取り、その `path` を cwd に
 * 添えて自身の U13 を叩く。**他の判定を持たない。**
 *
 * - `idle` にはやり直すものが無い
 * - `error` はリトライ上限に達した終端で、ユーザーへ引き渡す
 * - `running` は実行中。時間切れの判定は invokeAi の責務（プロセス内の見張り）
 *
 * 上限判定も定型の選択も invokeAi が行う。cwd も自分で組み立てない——一覧が返した
 * `path` をそのまま渡す（design.md D5）。
 *
 * **参照は API の応答から得て、書き込みは A8 を通す**（openspec/specs/agent/invocation
 * の MUST NOT: ファイルを直接読んで実行状態を判定してはならない）。
 *
 * ## 初回だけは `running` も倒す
 *
 * invokeAi の見張りはプロセス内にあるので、実行中にサーバーが落ちると `running` のまま
 * 誰も `failed` に変えない。巡回は `failed` しか拾わないため、倒さないと永久に放置される
 * （design.md Risks）。
 *
 * **立ち上がって最初の巡回の時点で `running` の件は、必ず前のプロセスの残骸である。**
 * このプロセスはまだ何も起動していないからで、そう判定してよいのは初回だけである。
 */

/** 巡回の間隔。設定ではない（docs/specs/core/settings-reference.md）。 */
const SWEEP_INTERVAL_MS = 60_000

export default defineNitroPlugin((nitro) => {
  let first = true

  const sweep = async (): Promise<void> => {
    let sessions: SessionSummary[]
    try {
      sessions = await $fetch<SessionSummary[]>('/api/strokes')
    } catch (error) {
      // 取れなければ次の巡回で拾う。前提が欠けているなら起動時チェックが伝える。
      console.warn(`${LOG_PREFIX} 一覧を取れなかった。次の巡回で拾う`, error)
      return
    }
    const reaping = first
    first = false

    let reaped = 0
    for (const session of sessions) {
      if (reaping && session.invocation === 'running') {
        try {
          await $fetch(submissionPath(session.id), {
            method: 'POST',
            body: { invocation: 'failed' },
          })
          reaped += 1
        } catch {
          // 書けない1件で全体を止めない。次の巡回で拾う。
        }
        continue
      }

      if (!shouldRetry(session.invocation)) continue

      try {
        await $fetch(invokePath(session.id, session.path))
      } catch (error) {
        // 起こし直せなかった件は次の巡回で拾う。1件で全体を止めない。
        console.warn(`${LOG_PREFIX} 再キックに失敗: ${session.id}`, error)
      }
    }

    if (reaped > 0) {
      console.warn(`${LOG_PREFIX} 前回の実行中だった ${reaped} 件を failed へ倒した（次の巡回で拾う）`)
    }
  }

  // 最初の1回は待たずに走らせる。ただしプラグインの初期化中はまだ自分の endpoint が
  // 応答しないので、今のティックを抜けてから叩く。
  const kickoff = setTimeout(() => void sweep(), 0)
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)

  nitro.hooks.hook('close', () => {
    clearTimeout(kickoff)
    clearInterval(timer)
  })
})
