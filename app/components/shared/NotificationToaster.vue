<script setup lang="ts">
/**
 * 通知トースト。本家 spec-workflow-mcp と同じ形にする（specs/notification-toast）。
 *
 * 右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・押しても何も起きない。
 * 対象を開く導線は通知一覧に一本化してあるので、ここからは進ませない。
 * 音は鳴らさない（design.md 決定13）。
 *
 * 見た目の出どころは本家 `modules/notifications/NotificationProvider.tsx` の
 * `NotificationToasts`。`ui.md` の Visual Language が「トーストだけは indigo 集約の外で、
 * `*-50/-200/-800` とダーク時 `*-900/20` の組み合わせ」と書いているのはこの実装のこと。
 * 本家と同じ Tailwind の階調をそのまま使うので、`--status-*` は経由しない。
 */
import { onBeforeUnmount, ref } from '#imports';

import UpstreamIcon from '~/components/shared/UpstreamIcon.vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';
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

/**
 * 本家の4種。枠・背景・文字・アイコンの色の組み合わせを本家からそのまま写している。
 * ダーク時だけを持てばよいわけではないので、明暗の両方を本家と同じクラスで持つ。
 */
const TONE = {
  info: {
    surface:
      'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
    icon: 'text-blue-500',
    glyph: 'info-circle',
  },
  success: {
    surface:
      'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
    icon: 'text-green-500',
    glyph: 'check-circle',
  },
  warning: {
    surface:
      'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
    icon: 'text-yellow-500',
    glyph: 'alert-triangle',
  },
  error: {
    surface:
      'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
    icon: 'text-red-500',
    glyph: 'alert-circle',
  },
  // 種別名は `UpstreamIcon` が持つ名前のまま渡す。ここで別名に変えない
} as const satisfies Record<NotificationTone, { surface: string; icon: string; glyph: string }>;

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
      class="rounded-lg border p-4 shadow-lg transition-all duration-300 ease-in-out"
      :class="TONE[toast.tone].surface"
      data-testid="toast"
      :data-tone="toast.tone"
    >
      <div class="flex items-start justify-between">
        <div class="flex items-start space-x-2">
          <UpstreamIcon
            :name="TONE[toast.tone].glyph"
            class="mt-0.5 h-5 w-5 flex-shrink-0"
            :class="TONE[toast.tone].icon"
          />
          <!-- 中身は1行テキストのみ。件名と本文の区別もリンクも持たない -->
          <p class="text-sm font-medium break-words">
            {{ toast.projectName }}: {{ toast.title }}
          </p>
        </div>
        <button
          type="button"
          class="ml-4 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline focus-visible:outline-2 dark:hover:text-gray-200"
          :aria-label="`${toast.title} の通知を閉じる`"
          data-testid="toast-dismiss"
          @click="dismiss(toast.id)"
        >
          <UpstreamIcon name="close" class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>
