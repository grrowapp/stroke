import type { Peer } from 'crossws'

/**
 * WS 接続の束ね。チャネル（question / proposal）ごとに、セッション id → 接続の集合を持つ。
 *
 * 「現在分」はここに複製しない。正は session-store（`state.json` / `proposal.md`）にあるため、
 * 接続時配信は route ハンドラがそちらを読んで送る（design.md: 書き手は1つ）。
 */
function createRegistry() {
  const peers = new Map<string, Set<Peer>>()

  return {
    register(sessionId: string, peer: Peer): void {
      let set = peers.get(sessionId)
      if (!set) {
        set = new Set()
        peers.set(sessionId, set)
      }
      set.add(peer)
    },
    unregister(sessionId: string, peer: Peer): void {
      const set = peers.get(sessionId)
      if (!set) return
      set.delete(peer)
      if (set.size === 0) peers.delete(sessionId)
    },
    /** 受理した瞬間、そのセッションに繋がっている全接続へ1件分を流す。 */
    publish(sessionId: string, message: unknown): void {
      const set = peers.get(sessionId)
      if (!set) return
      const data = JSON.stringify(message)
      for (const peer of set) peer.send(data)
    },
  }
}

/** W1 `/api/:id/ws/question` */
export const questionChannel = createRegistry()

/** W2 `/api/:id/ws/proposal` */
export const proposalChannel = createRegistry()
