/**
 * stroke-board のサーバーから通知を受ける。
 *
 * 繋ぐ先は stroke-board のサーバーだけで、本家 WebSocket には繋がない
 * （specs/upstream-connection）。上層と下層のどちらにいても受けるので、接続は
 * アプリ全体で1本だけ張り、画面遷移で張り替えない（design.md 決定7）。
 */

import { onScopeDispose, readonly, ref, type Ref } from 'vue';

import type { BoardMessage, Notification } from '#shared/types';

interface BoardSocket {
  notifications: Readonly<Ref<Notification[]>>;
  upstreamConnected: Readonly<Ref<boolean>>;
  /** 新しく発生した通知。トーストの発火に使う。初回スナップショットは流れない */
  onNotification: (handler: (notification: Notification) => void) => void;
}

let shared: BoardSocket | null = null;

export function useBoardSocket(): BoardSocket {
  if (shared !== null) return shared;

  const notifications = ref<Notification[]>([]);
  const upstreamConnected = ref(false);
  const handlers = new Set<(notification: Notification) => void>();

  // SSR では接続しない。ブラウザに渡ってから張る
  if (import.meta.client) {
    connect(notifications, upstreamConnected, handlers);
  }

  shared = {
    notifications: readonly(notifications) as Readonly<Ref<Notification[]>>,
    upstreamConnected: readonly(upstreamConnected),
    onNotification: (handler) => {
      handlers.add(handler);
      onScopeDispose(() => handlers.delete(handler));
    },
  };

  return shared;
}

function connect(
  notifications: Ref<Notification[]>,
  upstreamConnected: Ref<boolean>,
  handlers: Set<(notification: Notification) => void>,
): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener('message', (event) => {
    let message: BoardMessage;
    try {
      message = JSON.parse(String(event.data)) as BoardMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'snapshot':
        // 既に一覧にあるものはトーストにしない（specs/notification-toast）
        notifications.value = message.notifications;
        upstreamConnected.value = message.upstreamConnected;
        return;

      case 'notification':
        notifications.value = [message.notification, ...notifications.value];
        for (const handler of handlers) handler(message.notification);
        return;

      case 'upstream-connection':
        upstreamConnected.value = message.connected;
        return;
    }
  });

  socket.addEventListener('close', () => {
    upstreamConnected.value = false;
    // サーバーが再起動した場合に備えて張り直す
    setTimeout(() => connect(notifications, upstreamConnected, handlers), 2_000);
  });
}
