/**
 * ブラウザへ通知を配信するハブ。
 *
 * ブラウザは stroke-board のサーバーとだけ話す。本家 WebSocket にブラウザから直接
 * つながない（specs/upstream-connection）。
 *
 * ブラウザ1枚につき接続1本で、全プロジェクトの通知をそこで受ける。上層と下層のどちらに
 * いてもトーストは出るので、画面遷移で張り替えると取りこぼす（design.md 決定7）。
 */

import type { Peer } from 'crossws';

import type { UpstreamMonitor } from './monitor';
import type { BoardMessage, Notification } from '#shared/types';

/** 接続中のブラウザ */
const peers = new Set<Peer>();

let monitor: UpstreamMonitor | null = null;

export function registerMonitor(instance: UpstreamMonitor): void {
  monitor = instance;
}

export function currentMonitor(): UpstreamMonitor | null {
  return monitor;
}

export function addPeer(peer: Peer): void {
  peers.add(peer);

  // 接続直後に今の一覧を渡す。ここでトーストは出さない（specs/notification-toast）
  send(peer, {
    type: 'snapshot',
    notifications: monitor?.feed.list() ?? [],
    upstreamConnected: monitor?.connected ?? false,
  });
}

export function removePeer(peer: Peer): void {
  peers.delete(peer);
}

export function broadcastNotification(notification: Notification): void {
  broadcast({ type: 'notification', notification });
}

export function broadcastConnection(connected: boolean): void {
  broadcast({ type: 'upstream-connection', connected });
}

function broadcast(message: BoardMessage): void {
  for (const peer of peers) send(peer, message);
}

function send(peer: Peer, message: BoardMessage): void {
  try {
    peer.send(JSON.stringify(message));
  } catch {
    // 既に閉じている接続。次の broadcast から外れるよう落とす
    peers.delete(peer);
  }
}
