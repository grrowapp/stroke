/**
 * stroke-board のサーバーから通知を受ける。
 *
 * 繋ぐ先は stroke-board のサーバーだけで、本家 WebSocket には繋がない
 * （specs/upstream-connection）。上層と下層のどちらにいても受けるので、接続は
 * アプリ全体で1本だけ張り、画面遷移で張り替えない（design.md 決定7）。
 *
 * 1本に保つのは `createSharedComposable`。参照カウント式なので、購読 scope が全て
 * 消えると state ごと捨てて次の呼び出しで作り直す。**`app.vue` 直下の
 * `NotificationToaster` が常駐して購読を持ち続けること**が、その「全て消える」を
 * 起こさない前提になっている。あれを外すとレイアウト切替で接続が切れる。
 *
 * `createGlobalState` を使わないのは、あれがモジュールスコープに state を置くため。
 * SSR でリクエストを跨いで共有されてしまう。
 */

import { createEventHook, createSharedComposable, useWebSocket } from '@vueuse/core';
import { computed, readonly, ref, type Ref } from 'vue';

import type { BoardMessage, Notification } from '#shared/types';

interface BoardSocket {
  notifications: Readonly<Ref<Notification[]>>;
  upstreamConnected: Readonly<Ref<boolean>>;
  /** 新しく発生した通知。トーストの発火に使う。初回スナップショットは流れない */
  onNotification: (handler: (notification: Notification) => void) => void;
}

export const useBoardSocket = createSharedComposable((): BoardSocket => {
  const notifications = ref<Notification[]>([]);
  const upstreamConnected = ref(false);

  // 登録の解除は scope の破棄に任せる。Set の手管理も onScopeDispose も要らない
  const notified = createEventHook<Notification>();

  // SSR では接続しない。ブラウザに渡ってから張る（空の URL では繋がない）
  const url = computed(() => {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  });

  useWebSocket(url, {
    // サーバーが再起動した場合に備えて張り直す。既定は 1000ms なので現行の2秒に揃える
    autoReconnect: { delay: 2_000 },

    onMessage(_ws, event) {
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
          void notified.trigger(message.notification);
          return;

        case 'upstream-connection':
          upstreamConnected.value = message.connected;
          return;
      }
    },

    onDisconnected() {
      upstreamConnected.value = false;
    },
  });

  return {
    notifications: readonly(notifications) as Readonly<Ref<Notification[]>>,
    upstreamConnected: readonly(upstreamConnected),
    onNotification: (handler) => {
      notified.on(handler);
    },
  };
});
