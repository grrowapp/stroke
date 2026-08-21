<script setup lang="ts">
/**
 * 通知トースト。本家 spec-workflow-mcp と同じ形にする（specs/notification-toast）。
 *
 * 右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・押しても何も起きない。
 * 対象を開く導線は通知一覧に一本化してあるので、ここからは進ませない。
 * 音は鳴らさない（design.md 決定13）。
 */
import { onBeforeUnmount, ref } from '#imports';

import { useBoardSocket } from '~/composables/useBoardSocket';
import type { Notification, NotificationTone } from '#shared/types';

/** 本家と同じ 5 秒 */
const AUTO_DISMISS_MS = 5_000;

const toasts = ref<Notification[]>([]);
const timers = new Set<ReturnType<typeof setTimeout>>();

const { onNotification } = useBoardSocket();

onNotification((notification) => {
  toasts.value = [...toasts.value, notification];

  const timer = setTimeout(() => {
    dismiss(notification.id);
    timers.delete(timer);
  }, AUTO_DISMISS_MS);

  timers.add(timer);
});

function dismiss(id: string): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

/** 本家は info / success / warning / error の4色。ここだけ indigo 集約の外に置く */
const toneClass: Record<NotificationTone, string> = {
  info: 'bg-blue-900/20 border-blue-800 text-blue-200',
  success: 'bg-green-900/20 border-green-800 text-green-200',
  warning: 'bg-yellow-900/20 border-yellow-800 text-yellow-200',
  error: 'bg-red-900/20 border-red-800 text-red-200',
};

onBeforeUnmount(() => {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
});
</script>

<template>
  <!--
    aria-live で読み上げには乗せるが、フォーカスは移さない。作業中に割り込むものなので
    フォーカスを奪ってはいけない（specs/notification-toast）。
  -->
  <div
    class="fixed top-4 right-4 z-50 space-y-2 max-w-sm"
    role="status"
    aria-live="polite"
    data-testid="toaster"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="flex items-start gap-2 rounded-md border px-3 py-2 shadow-lg"
      :class="toneClass[toast.tone]"
      data-testid="toast"
      :data-tone="toast.tone"
    >
      <!-- 中身は1行テキストのみ。件名と本文の区別もリンクも持たない -->
      <p class="text-sm font-medium break-words flex-1">
        {{ toast.projectName }}: {{ toast.title }}
      </p>
      <button
        type="button"
        class="shrink-0 opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
        :aria-label="`${toast.title} の通知を閉じる`"
        data-testid="toast-dismiss"
        @click="dismiss(toast.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
