// 送信後の待機・失敗の扱い（task 6.3）。待機中のみ U2 を数秒おきに読み直し、
// `invocation: failed` ならエラー表示にする。通常は W1 / W2 の配信が先に届いて
// 呼び出し側が stopWaiting() を呼ぶため、ポーリングは保険（design.md 決定6）。
// 回復（同じ入力 POST の再送）はここでは行わない。呼び出し側の役割。
import { useIntervalFn } from '@vueuse/core'
import type { Invocation } from '#shared/stroke'

const POLL_INTERVAL_MS = 3000

export function useWaitingRetry(sessionId: MaybeRefOrGetter<string>) {
  const waiting = ref(false)
  const failed = ref(false)

  // `resume()` は張り直しのたびに前の timer を捨てるので、手で clear する必要がない。
  // scope が壊れたときの停止も内蔵している
  const poll = useIntervalFn(
    async () => {
      const status = await $fetch<{ invocation: Invocation }>(`/api/strokes/${toValue(sessionId)}`)
      if (status.invocation === 'failed') {
        failed.value = true
        waiting.value = false
        poll.pause()
      } else if (status.invocation === 'idle') {
        waiting.value = false
        poll.pause()
      }
    },
    POLL_INTERVAL_MS,
    { immediate: false },
  )

  function startWaiting(): void {
    waiting.value = true
    failed.value = false
    // ポーリングはブラウザでのみ意味を持つ。SSR で `setInterval` を張ると Nuxt が
    // 例外にする（実測: reload 直後の SSR で `invocation: running` を踏んで判明）。
    // `resume()` は client 限定のガードを持たないので、ここで止める必要がある
    if (import.meta.server) return
    poll.resume()
  }

  function stopWaiting(): void {
    waiting.value = false
    failed.value = false
    poll.pause()
  }

  return { waiting, failed, startWaiting, stopWaiting }
}
