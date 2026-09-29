import type { Phase } from '#shared/stroke'
import { currentProposal } from '../../../../../handler/proposal'
import { accessUserOfPeer, canViewSession } from '../../../../../utils/access/request'
import { sessionExists } from '../../../../../utils/stroke/session-store'
import { proposalChannel, sessionIdFromUrl } from '../../../../../utils/stroke/ws-channels'

/**
 * W2 `/api/sessions/:id/ws/proposal`。proposal と名前候補を配信する。セッション id は URL から読む。
 * パスのパターンは `runtimeConfig.wsPathPattern`。読むのは `ws-channels.ts` の1本。
 *
 * ここが持つのは接続の準備と後始末だけである——id を読む・在るかを見る・登録する・解除する・
 * 受け取った現在分を `peer.send` で送る。現在分の読み出しと `ProposalMessage` の組み立ては
 * `handler/proposal.ts` が持ち、A7 が受理の瞬間に流すものと同じところを通る。
 */

/** 接続の瞬間に proposal を流してよい局面。`stroking` はまだ proposal を持たない */
const DELIVERABLE: readonly Phase[] = ['proposed', 'approved', 'activated']

export default defineWebSocketHandler({
  async open(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'proposal')
    if (!sessionId || !(await sessionExists(sessionId))) {
      peer.close()
      return
    }
    // 見られないセッションは、何も送らずに閉じる（access/permission・design D6）
    if (!(await canViewSession(await accessUserOfPeer(peer), sessionId))) {
      peer.close()
      return
    }
    proposalChannel.register(sessionId, peer)

    // 接続時配信: 現在の proposal があればそれを1件流す（design.md 決定6）
    const message = await currentProposal(sessionId, DELIVERABLE)
    if (message) peer.send(JSON.stringify(message))
  },
  close(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'proposal')
    if (sessionId) proposalChannel.unregister(sessionId, peer)
  },
})
