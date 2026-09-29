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

import type { AccessUser } from '#shared/access';
import { projectNameOf } from '../access/request';
import { createPeerRegistry } from '../ws/registry';
import type { UpstreamMonitor } from './monitor';
import type { BoardMessage, Notification, ProjectCreationOutcome } from '#shared/types';

/** 接続中のブラウザ */
const peers = createPeerRegistry();

/**
 * 接続ごとの利用者。通知と生成の出来事は、その利用者が見られるプロジェクトの分だけを送る
 * （`notification-feed`・`access/permission`）。見られないプロジェクトの出来事は届かない。
 */
const users = new Map<Peer, AccessUser>();

function canSee(user: AccessUser | undefined, projectName: string | null): boolean {
  if (!user) return false;
  if (user.admin) return true;
  return projectName !== null && user.projects.includes(projectName);
}

/** 通知ごとに、その通知のプロジェクトの名前を引く。通知は本家の `projectId` しか持たない */
async function namesOf(notifications: readonly Notification[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(notifications.map((notification) => notification.projectId))];
  const names = await Promise.all(ids.map((id) => projectNameOf(id)));
  return new Map(ids.map((id, index) => [id, names[index] ?? null]));
}

let monitor: UpstreamMonitor | null = null;

export function registerMonitor(instance: UpstreamMonitor): void {
  monitor = instance;
}

export function currentMonitor(): UpstreamMonitor | null {
  return monitor;
}

export async function addPeer(peer: Peer, user: AccessUser): Promise<void> {
  peers.register(peer);
  users.set(peer, user);

  // 接続直後に今の分を渡す。ここでトーストは出さない（specs/notification-toast）し、
  // 生成の祝いも出さない（specs/project/generation）。現在分と、接続後に起きた出来事の
  // 区別は、メッセージの型でつく（specs/ws/delivery）
  const notifications = monitor?.feed.list() ?? [];
  peers.sendTo(peer, snapshotFor(user, notifications, await namesOf(notifications)));
}

/**
 * 開いているブラウザへ一覧を送り直す。
 *
 * 監視対象から外れたプロジェクトの通知はサーバー側で落とすが、それだけでは既に開いて
 * いるブラウザに残り続ける。行を押しても入れない先を指したままになるので、落としたことを
 * 伝える。
 */
export async function broadcastSnapshot(): Promise<void> {
  const notifications = monitor?.feed.list() ?? [];
  const names = await namesOf(notifications);
  for (const [peer, user] of users) {
    peers.sendTo(peer, snapshotFor(user, notifications, names));
  }
}

/** その利用者が見られるプロジェクトの通知だけを載せた現在分 */
function snapshotFor(
  user: AccessUser,
  notifications: readonly Notification[],
  names: ReadonlyMap<string, string | null>,
): BoardMessage {
  return {
    type: 'snapshot',
    notifications: notifications.filter((notification) => canSee(user, names.get(notification.projectId) ?? null)),
    upstreamConnected: monitor?.connected ?? false,
  };
}

export function removePeer(peer: Peer): void {
  peers.unregister(peer);
  users.delete(peer);
}

export async function broadcastNotification(notification: Notification): Promise<void> {
  const name = await projectNameOf(notification.projectId);
  peers.broadcastTo(
    (peer) => canSee(users.get(peer), name),
    { type: 'notification', notification } satisfies BoardMessage,
  );
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
 * 呼ぶのは2箇所だけ——昇格の受け口（U14・改名の直後）と `setInvocation`（A8）。承認の
 * 判断（U10）では呼ばない——その時点でプロジェクトはまだ無い。`invocation` の
 * 書き込みはすべて A8 を通るので、書いたのに流れない経路が生まれない（design.md D5）。
 */
export function broadcastProjectCreation(name: string, state: ProjectCreationOutcome): void {
  // 見られない利用者へ送ると、新しいプロジェクトの名前が届いてしまう（access/permission）
  peers.broadcastTo(
    (peer) => canSee(users.get(peer), name),
    { type: 'project-creation', name, state } satisfies BoardMessage,
  );
}
