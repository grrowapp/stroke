// W2 `/api/strokes/:id/ws/proposal` を購読する。proposal と名前候補を1件分だけ持ち、
// 最後に届いた1件で上書きする（design.md 決定6）。
import { useWebSocket } from '@vueuse/core'
import type { ProposalMessage } from '#shared/stroke'

function wsUrl(sessionId: string): string {
  if (typeof window === 'undefined') return ''
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/api/strokes/${sessionId}/ws/proposal`
}

export function useProposalChannel(sessionId: MaybeRefOrGetter<string>) {
  const message = ref<ProposalMessage | null>(null)
  const url = computed(() => wsUrl(toValue(sessionId)))

  useWebSocket(url, {
    autoReconnect: true,
    onMessage(_ws, event) {
      message.value = JSON.parse(String(event.data)) as ProposalMessage
    },
  })

  return { message }
}
