import { readState, sessionExists } from '../../../../../utils/stroke/session-store'
import { questionChannel } from '../../../../../utils/stroke/ws-channels'

/**
 * W1 `/api/:id/ws/question`。今の1問分を配信する。
 *
 * crossws の peer は h3 のルートパラメータを持たない（実測: `peer.context` は空、
 * `peer.request.url` に完全な URL が入る）ので、セッション id は URL から自分で読む。
 */
function sessionIdFromUrl(url: string): string | null {
  const match = /\/api\/strokes\/([^/]+)\/ws\/question(?:$|[/?#])/.exec(new URL(url).pathname)
  return match?.[1] ?? null
}

export default defineWebSocketHandler({
  async open(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url)
    if (!sessionId || !(await sessionExists(sessionId))) {
      peer.close()
      return
    }
    questionChannel.register(sessionId, peer)

    // 接続時配信: 現在の1問があればそれを1件流す（design.md 決定6）。
    const state = await readState(sessionId)
    if (state.phase !== 'approved' && state.currentQuestion) {
      peer.send(JSON.stringify(state.currentQuestion))
    }
  },
  close(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url)
    if (sessionId) questionChannel.unregister(sessionId, peer)
  },
})
