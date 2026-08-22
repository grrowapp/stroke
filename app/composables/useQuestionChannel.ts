// W1 `/api/strokes/:id/ws/question` を購読する。今の1問分だけを持ち、最後に届いた1件で上書きする
// （design.md 決定6）。接続時にも現在分が1件届く（サーバ側の接続時配信）。
import { useWebSocket } from '@vueuse/core'
import type { Question } from '#shared/stroke'

function wsUrl(sessionId: string): string {
  if (typeof window === 'undefined') return ''
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/api/strokes/${sessionId}/ws/question`
}

export function useQuestionChannel(sessionId: MaybeRefOrGetter<string>) {
  const question = ref<Question | null>(null)
  const url = computed(() => wsUrl(toValue(sessionId)))

  useWebSocket(url, {
    autoReconnect: true,
    onMessage(_ws, event) {
      question.value = JSON.parse(String(event.data)) as Question
    },
  })

  return { question }
}
