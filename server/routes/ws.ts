/**
 * ブラウザ向け WebSocket。通知の配信だけを担う。
 */

import { defineWebSocketHandler } from 'h3';

import { addPeer, removePeer } from '../utils/control/board';

export default defineWebSocketHandler({
  open(peer) {
    addPeer(peer);
  },
  close(peer) {
    removePeer(peer);
  },
  error(peer) {
    removePeer(peer);
  },
});
