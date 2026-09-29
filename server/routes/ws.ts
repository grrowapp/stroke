/**
 * ブラウザ向け WebSocket。通知の配信だけを担う。
 *
 * 接続ごとに利用者を求め、その利用者が見られるプロジェクトの分だけを送る
 * （`notification-feed`・`access/permission`）。upgrade は `request` hook を通らないので、
 * 接続が開いたときに求める（design D6）。
 */

import { defineWebSocketHandler } from 'h3';

import { accessUserOfPeer } from '../utils/access/request';
import { addPeer, removePeer } from '../utils/control/board';

export default defineWebSocketHandler({
  async open(peer) {
    await addPeer(peer, await accessUserOfPeer(peer));
  },
  close(peer) {
    removePeer(peer);
  },
  error(peer) {
    removePeer(peer);
  },
});
