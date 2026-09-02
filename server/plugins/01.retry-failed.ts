import { defineNitroPlugin } from 'nitropack/runtime'

import type { SessionSummary } from '#shared/stroke'
import { invokePath } from '../utils/stroke/invoke'
import { LOG_PREFIX } from '../utils/stroke/log'
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
 * 起動時の後始末（`01.reap-running.ts`）と巡回の間に、呼び出し順序の取り決めは持たない
 * （openspec/specs/agent/invocation「起動時の後始末と巡回は、互いの完了を待たない」）。
 * 対象1件ごとの順序——後始末は終了を確かめてから `failed` を書く——だけで二重起動は
 * 防げているため、待ち合わせの仕組みは不要である。
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

  void sweep()

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)

  nitro.hooks.hook('close', () => {
    clearInterval(timer)
  })
})
