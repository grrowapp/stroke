import type { Phase } from '#shared/stroke'
import { currentQuestion } from '../../../../../handler/question'
import { accessUserOfPeer, canViewSession } from '../../../../../utils/access/request'
import { sessionExists } from '../../../../../utils/stroke/session-store'
import { questionChannel, sessionIdFromUrl } from '../../../../../utils/stroke/ws-channels'

/**
 * W1 `/api/sessions/:id/ws/question`。今の1問分を配信する。
 *
 * crossws の peer は h3 のルートパラメータを持たない（実測: `peer.context` は空、
 * `peer.request.url` に完全な URL が入る）ので、セッション id は URL から自分で読む。
 * パスのパターンは `runtimeConfig.wsPathPattern`。読むのは `ws-channels.ts` の1本。
 *
 * ここが持つのは接続の準備と後始末だけである——id を読む・在るかを見る・登録する・解除する・
 * 受け取った現在分を `peer.send` で送る。現在分の読み出しは `handler/question.ts` が持つ。
 */

/** 接続の瞬間に問いを流してよい局面。承認以降（`approved` / `activated`）は問いを持たない */
const DELIVERABLE: readonly Phase[] = ['stroking', 'proposed']

export default defineWebSocketHandler({
  async open(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'question')
    if (!sessionId || !(await sessionExists(sessionId))) {
      peer.close()
      return
    }
    // 見られないセッションは、何も送らずに閉じる（access/permission・design D6）
    if (!(await canViewSession(await accessUserOfPeer(peer), sessionId))) {
      peer.close()
      return
    }
    questionChannel.register(sessionId, peer)

    // 接続時配信: 現在の1問があればそれを1件流す（design.md 決定6）
    const question = await currentQuestion(sessionId, DELIVERABLE)
    if (question) peer.send(JSON.stringify(question))
  },
  close(peer) {
    const sessionId = sessionIdFromUrl(peer.request.url, 'question')
    if (sessionId) questionChannel.unregister(sessionId, peer)
  },
})
