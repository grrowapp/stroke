// セッションの WS チャンネルを購読する。W1(question) と W2(proposal) の共通部分。
//
// どちらも「最後に届いた1件で上書きして持つ」だけで、違うのは購読先のパスと届く型に
// 尽きる（design.md 決定6）。接続時にもサーバ側が現在分を1件配信するので、開き直しても
// 同じ経路で初期値が入る。
import { useWebSocket } from '@vueuse/core'

/**
 * `channel` のチャンネルを購読し、最後に届いた1件を持つ。
 *
 * URL はブラウザの現在地から組み立てる。SSR では空文字を返して接続させない
 * （`useWebSocket` は空の URL では繋がない）。
 */
export function useSessionChannel<T>(sessionId: MaybeRefOrGetter<string>, channel: string) {
  const latest = ref<T | null>(null)

  const url = computed(() => {
    if (typeof window === 'undefined') return ''
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${scheme}://${window.location.host}/api/sessions/${toValue(sessionId)}/ws/${channel}`
  })

  useWebSocket(url, {
    autoReconnect: true,
    onMessage(_ws, event) {
      latest.value = JSON.parse(String(event.data)) as T
    },
  })

  return latest
}
