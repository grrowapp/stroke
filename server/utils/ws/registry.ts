import type { Peer } from 'crossws'

/**
 * WS 接続の束ね。ここに1つだけ置く。
 *
 * ストローク側（W1 / W2）はセッション id をキーに持ち、上層への配信（board）はキーを
 * 持たない。**両者はキーの有無しか違わない。** 別々に書くと、片方に入れた直し——死んだ
 * 接続を落とす、といった類——がもう片方に入らない。実装を1つに保つのは
 * `openspec/specs/ws/delivery` の規約である。
 *
 * 送信で例外が出た接続はその場で落とす。既に閉じている接続を集合に残すと、以後の配信の
 * たびに同じ例外を踏む。close ハンドラが呼ばれる前に相手が消えている場合があるので、
 * 送信側でも落とせるようにしておく。
 */

/** キーごとに接続を束ねる。ストローク側が使う */
export interface KeyedPeerRegistry<K> {
  register(key: K, peer: Peer): void
  unregister(key: K, peer: Peer): void
  /** そのキーに繋がっている全接続へ1件流す */
  publish(key: K, message: unknown): void
}

/** 全接続を1つに束ねる。上層への配信が使う */
export interface PeerRegistry {
  register(peer: Peer): void
  unregister(peer: Peer): void
  /** 繋がっている全接続へ1件流す */
  broadcast(message: unknown): void
  /** 1つの接続だけへ流す。接続時の現在分の配信に使う */
  sendTo(peer: Peer, message: unknown): void
  /** `select` が true を返す接続だけへ1件流す。利用者ごとの絞り込みに使う（`access/permission`） */
  broadcastTo(select: (peer: Peer) => boolean, message: unknown): void
}

export function createKeyedPeerRegistry<K>(): KeyedPeerRegistry<K> {
  const byKey = new Map<K, Set<Peer>>()

  return {
    register(key, peer) {
      let set = byKey.get(key)
      if (!set) {
        set = new Set()
        byKey.set(key, set)
      }
      set.add(peer)
    },

    unregister(key, peer) {
      const set = byKey.get(key)
      if (!set) return
      set.delete(peer)
      if (set.size === 0) byKey.delete(key)
    },

    publish(key, message) {
      const set = byKey.get(key)
      if (!set) return
      const data = JSON.stringify(message)
      for (const peer of set) {
        if (!trySend(peer, data)) set.delete(peer)
      }
      if (set.size === 0) byKey.delete(key)
    },
  }
}

export function createPeerRegistry(): PeerRegistry {
  const peers = new Set<Peer>()

  return {
    register(peer) {
      peers.add(peer)
    },

    unregister(peer) {
      peers.delete(peer)
    },

    broadcast(message) {
      const data = JSON.stringify(message)
      for (const peer of peers) {
        if (!trySend(peer, data)) peers.delete(peer)
      }
    },

    sendTo(peer, message) {
      if (!trySend(peer, JSON.stringify(message))) peers.delete(peer)
    },

    broadcastTo(select, message) {
      const data = JSON.stringify(message)
      for (const peer of peers) {
        if (!select(peer)) continue
        if (!trySend(peer, data)) peers.delete(peer)
      }
    },
  }
}

/** 送れたら true。既に閉じている接続では false を返し、呼び出し側が集合から落とす */
function trySend(peer: Peer, data: string): boolean {
  try {
    peer.send(data)
    return true
  } catch {
    return false
  }
}
