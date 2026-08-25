// 送信後の待機・失敗の扱い（task 6.3）。待機中のみ U2 を数秒おきに読み直し、
// `invocation: failed` ならエラー表示にする。通常は W1 / W2 の配信が先に届いて
// 呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険（design.md 決定6）。
// 回復（同じ入力 POST の再送）はここでは行わない。呼び出し側の役割。
import type { Invocation } from '#shared/stroke'

const POLL_INTERVAL_MS = 3000

export function useWaitingRetry(sessionId: MaybeRefOrGetter<string>) {
  const waiting = ref(false)
  const failed = ref(false)
  /**
   * リトライ上限に達した終端（openspec/specs/agent/invocation）。
   * `failed` と分けるのは、`failed` が巡回で自動的に起こし直されるのに対し、
   * `error` はシステムが何もせずユーザーへ引き渡す状態だからである。
   */
  const errored = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  function stopPolling(): void {
    if (timer !== null) clearInterval(timer)
    timer = null
  }

  function startWaiting(): void {
    waiting.value = true
    failed.value = false
    errored.value = false
    stopPolling()
    // ポーリングはブラウザでのみ意味を持つ。SSR で `setInterval` を張ると Nuxt が
    // 例外にする（実測: reload 直後の SSR で `invocation: running` を踏んで判明）。
    if (import.meta.server) return
    timer = setInterval(async () => {
      const status = await $fetch<{ invocation: Invocation }>(`/api/strokes/${toValue(sessionId)}`)
      if (status.invocation === 'error') {
        // 終端。巡回は拾わないので、ユーザーが再実行か削除を選ぶまで動かない。
        errored.value = true
        waiting.value = false
        stopPolling()
      } else if (status.invocation === 'failed') {
        failed.value = true
        waiting.value = false
        stopPolling()
      } else if (status.invocation === 'idle') {
        waiting.value = false
        stopPolling()
      }
    }, POLL_INTERVAL_MS)
  }

  function stopWaiting(): void {
    waiting.value = false
    failed.value = false
    errored.value = false
    stopPolling()
  }

  /**
   * `error` からの再実行（openspec/specs/agent/invocation「ユーザーが再実行する」）。
   *
   * 回数のリセットは `reset` を付けた U13 が行う。**画面は `invocation` を直接書かない**
   * ——A8 を叩けるのは invokeAi だけである（同 spec の MUST）。
   */
  async function retryFromError(): Promise<void> {
    await $fetch(`/api/strokes/${toValue(sessionId)}/invoke-agent`, { query: { reset: 1 } })
    startWaiting()
  }

  /** `error` からの削除。回復手段のもう一方（U11）。 */
  async function discard(): Promise<void> {
    await $fetch(`/api/strokes/${toValue(sessionId)}/delete`, { method: 'POST' })
  }

  onScopeDispose(stopPolling)

  return { waiting, failed, errored, startWaiting, stopWaiting, retryFromError, discard }
}
