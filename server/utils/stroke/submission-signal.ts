/**
 * A5・A7 の提出到着を、タイムアウト待ちの呼び出し（`ai.ts`）へ知らせる。
 *
 * 単一プロセスの MVP なのでメモリ上のコールバック集合で足りる（`running.ts` と同じ割り切り）。
 */
const waiters = new Map<string, Set<() => void>>()

/** A5・A7 が提出を受理した瞬間に呼ぶ。待っている呼び出しがあれば起こす。 */
export function notifySubmission(sessionId: string): void {
  const set = waiters.get(sessionId)
  if (!set) return
  waiters.delete(sessionId)
  for (const resolve of set) resolve()
}

/**
 * タイムアウト時間内に提出が届けば true、届かないまま時間が過ぎたら false で解決する。
 */
export function waitForSubmission(sessionId: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onSignal = (): void => {
      clearTimeout(timer)
      remove()
      resolve(true)
    }
    const timer = setTimeout(() => {
      remove()
      resolve(false)
    }, timeoutMs)

    const set = waiters.get(sessionId) ?? new Set()
    set.add(onSignal)
    waiters.set(sessionId, set)

    function remove(): void {
      const current = waiters.get(sessionId)
      if (!current) return
      current.delete(onSignal)
      if (current.size === 0) waiters.delete(sessionId)
    }
  })
}
