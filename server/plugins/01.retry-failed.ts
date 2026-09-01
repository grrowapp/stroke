import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { invokePath } from '../utils/stroke/invoke'
import { LOG_PREFIX } from '../utils/stroke/log'
import { awaitReap } from '../utils/stroke/reap-gate'
import { shouldRetry } from '../utils/stroke/sweep'

/**
 * 起こし直す対象を拾う巡回（openspec/specs/portal/batch）。
 *
 * 一覧（U12）から `invocation === 'failed'` の件**だけ**を取り、その `path` を cwd に
 * 添えて自身の U13 を叩く。**他の判定を持たない。**
 *
 * `failed` は「失敗した実行」に限らず「起こし直す対象」の印である（`sweep.ts`）。昇格の
 * 受け口（U14）は起動を要求せず、昇格した対象をこの値で残す。起動の要求が一度も届かなくても
 * ここが拾って steering を起こす——渡す値は画面のキックと同じ（`kind` は U13 が phase から
 * 導き、cwd は一覧の `path` = 昇格後のディレクトリ）。
 *
 * - `idle` にはやり直すものが無い
 * - `error` はリトライ上限に達した終端で、ユーザーへ引き渡す
 * - `running` は実行中。時間切れの判定は invokeAi の責務（プロセス内の見張り）。
 *   サーバー再起動をまたいで残った `running` の後始末は、専用のプラグイン
 *   （`server/plugins/01.reap-running.ts`）が担う——巡回はここで `running` を拾わない
 *   （design.md Decision 3。以前はここが初回周回で `running` も `failed` へ倒していたが、
 *   `portal/batch`「巡回は `failed` だけを拾う」と食い違っていた）
 *
 * 上限判定も定型の選択も invokeAi が行う。cwd も自分で組み立てない——一覧が返した
 * `path` をそのまま渡す（design.md D5）。
 *
 * **参照は API の応答から得て、書き込みは A8 を通す**（openspec/specs/agent/invocation
 * の MUST NOT: ファイルを直接読んで実行状態を判定してはならない）。
 *
 * ## 最初の周回は後始末の完了を待つ
 *
 * 後始末（`01.reap-running.ts`）が済む前に巡回が `failed` を起こし直すと、後始末が
 * まだ倒していない `running` の対象へ2つ目の claude を立てかねない
 * （openspec/specs/agent/invocation「後始末より先に起こし直さない」）。待ち合わせは
 * `reap-gate.ts` の門を通す——後始末が失敗して終わっても門は開くので、巡回が永久に
 * 止まることはない（design.md tasks 3.2）。
 */

/** 巡回の間隔。設定ではない（docs/specs/core/settings-reference.md）。 */
const SWEEP_INTERVAL_MS = 60_000

export default defineNitroPlugin((nitro) => {
  const sweep = async (): Promise<void> => {
    let sessions: SessionSummary[]
    try {
      sessions = await $fetch<SessionSummary[]>('/api/strokes')
    } catch (error) {
      // 取れなければ次の巡回で拾う。前提が欠けているなら起動時チェックが伝える。
      console.warn(`${LOG_PREFIX} 一覧を取れなかった。次の巡回で拾う`, error)
      return
    }

    for (const session of sessions) {
      if (!shouldRetry(session.invocation)) continue

      try {
        await $fetch(invokePath(session.id, session.path))
      } catch (error) {
        // 起こし直せなかった件は次の巡回で拾う。1件で全体を止めない。
        console.warn(`${LOG_PREFIX} 再キックに失敗: ${session.id}`, error)
      }
    }
  }

  // 最初の1回も後始末の完了後に走らせる。プラグインの初期化中はまだ自分の endpoint が
  // 応答しないので、いずれにせよ今のティックを抜けてから叩く必要はあったが、
  // それだけでは後始末の完了を待てない（Nitro のプラグイン実行順は保証されない）ため
  // `awaitReap()` で明示的に待ち合わせる。
  const kickoff = (async () => {
    await awaitReap()
    await sweep()
  })()
  kickoff.catch(() => {})

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)

  nitro.hooks.hook('close', () => {
    clearInterval(timer)
  })
})
