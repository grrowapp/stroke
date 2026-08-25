import { readStrokeConfig } from '../utils/stroke/config'
import { LOG_PREFIX } from '../utils/stroke/log'
import { listSessionsCore } from '../utils/stroke/session-core'
import { readState, writeState } from '../utils/stroke/session-store'

/**
 * 起動時に `running` の残骸を `failed` へ倒す。
 *
 * invokeAi の見張り（タイムアウト）はプロセス内にある。実行中にサーバーが落ちると、
 * `running` のまま誰も `failed` に変えない。巡回（openspec/specs/portal/batch）は
 * `failed` しか拾わないので、倒しておかないと永久に放置される（design.md Risks）。
 *
 * 倒すだけで、起こし直しはしない。それは巡回の仕事である。
 */
export default defineNitroPlugin(async () => {
  let root: string
  try {
    root = readStrokeConfig().projectShareRoot
  } catch {
    // 設定が壊れているなら起動時チェック（00.startup-checks）が伝える。ここは黙って降りる。
    return
  }

  let reaped = 0
  for (const session of await listSessionsCore(root)) {
    try {
      const state = await readState(session.id)
      if (state.invocation !== 'running') continue
      await writeState(session.id, { ...state, invocation: 'failed' })
      reaped += 1
    } catch {
      // 読めない・書けない1件で全体を止めない。
    }
  }

  if (reaped > 0) {
    console.warn(`${LOG_PREFIX} 前回の実行中だった ${reaped} 件を failed へ倒した（巡回が拾う）`)
  }
})
