import type { ProposalMessage } from '#shared/stroke'
import { readState, sessionExists, sessionProposal } from '../../../../../utils/stroke/session-store'
import { proposalChannel, sessionIdFromUrl } from '../../../../../utils/stroke/ws-channels'

/**
 * W2 `/api/:id/ws/proposal`。proposal と名前候補を配信する。セッション id は URL から読む。
 * パスのパターンは `runtimeConfig.wsPathPattern`。読むのは `ws-channels.ts` の1本。
 */

export default defineWebSocketHandler({
  async open(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'proposal')
    if (!sessionId || !(await sessionExists(sessionId))) {
      peer.close()
      return
    }
    proposalChannel.register(sessionId, peer)

    // 接続時配信: 現在の proposal があればそれを1件流す（design.md 決定6）。
    const state = await readState(sessionId)
    if (state.phase === 'stroking') return
    const proposal = await sessionProposal(sessionId).read()
    if (proposal === undefined) return
    const message: ProposalMessage = { proposal, projectName: state.projectName ?? null }
    peer.send(JSON.stringify(message))
  },
  close(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'proposal')
    if (sessionId) proposalChannel.unregister(sessionId, peer)
  },
})
