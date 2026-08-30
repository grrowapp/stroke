/**
 * 上層へのサーバー発イベントの口。
 *
 * 運ぶのは本家由来の通知だけではない。stroke-board 自身が起こした出来事——プロジェクトの
 * 生成が始まった・終わった・失敗した——も同じここから流す。**出来事の種類が増えても口は
 * 増やさない**（`openspec/specs/ws/delivery`）。増やすのはメッセージの種別だけである。
 *
 * ブラウザは stroke-board のサーバーとだけ話す。本家 WebSocket にブラウザから直接
 * つながない（specs/upstream-connection）。
 *
 * ブラウザ1枚につき接続1本で、全プロジェクトぶんをそこで受ける。上層と下層のどちらに
 * いてもトーストは出るので、画面遷移で張り替えると取りこぼす（design.md 決定7）。
 *
 * 接続の束ねは `server/utils/ws/registry.ts` の1本を使う。ストローク側（W1 / W2）と同じ
 * 実装で、違いはキーを持つかどうかだけである。
 */

import type { Peer } from 'crossws';

import { createPeerRegistry } from '../ws/registry';
import type { UpstreamMonitor } from './monitor';
import type { BoardMessage, Notification, ProjectCreationOutcome } from '#shared/types';

/** 接続中のブラウザ */
const peers = createPeerRegistry();

let monitor: UpstreamMonitor | null = null;

export function registerMonitor(instance: UpstreamMonitor): void {
  monitor = instance;
}

export function currentMonitor(): UpstreamMonitor | null {
  return monitor;
}

export function addPeer(peer: Peer): void {
  peers.register(peer);

  // 接続直後に今の分を渡す。ここでトーストは出さない（specs/notification-toast）し、
  // 生成の祝いも出さない（specs/project/generation）。現在分と、接続後に起きた出来事の
  // 区別は、メッセージの型でつく（specs/ws/delivery）
  peers.sendTo(peer, snapshot());
}

/**
 * 開いているブラウザへ一覧を送り直す。
 *
 * 監視対象から外れたプロジェクトの通知はサーバー側で落とすが、それだけでは既に開いて
 * いるブラウザに残り続ける。行を押しても入れない先を指したままになるので、落としたことを
 * 伝える。
 */
export function broadcastSnapshot(): void {
  peers.broadcast(snapshot());
}

function snapshot(): BoardMessage {
  return {
    type: 'snapshot',
    notifications: monitor?.feed.list() ?? [],
    upstreamConnected: monitor?.connected ?? false,
  };
}

export function removePeer(peer: Peer): void {
  peers.unregister(peer);
}

export function broadcastNotification(notification: Notification): void {
  peers.broadcast({ type: 'notification', notification } satisfies BoardMessage);
}

export function broadcastConnection(connected: boolean): void {
  peers.broadcast({ type: 'upstream-connection', connected } satisfies BoardMessage);
}

/**
 * プロジェクトの生成が始まった・終わった・失敗したことを上層へ流す。
 *
 * 行の中身は載せない。一覧の正は `GET /api/projects` の1つで、これは「取り直せ」の合図と
 * 完了を祝う引き金である（design.md D3）。
 *
 * 呼ぶのは2箇所だけ——承認処理（昇格の直後）と `setInvocation`（A8）。`invocation` の
 * 書き込みはすべて A8 を通るので、書いたのに流れない経路が生まれない（design.md D5）。
 */
export function broadcastProjectCreation(name: string, state: ProjectCreationOutcome): void {
  peers.broadcast({ type: 'project-creation', name, state } satisfies BoardMessage);
}
