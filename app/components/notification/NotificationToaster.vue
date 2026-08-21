<script setup lang="ts">
/**
 * 通知トースト。本家 spec-workflow-mcp と同じ形にする（specs/notification-toast）。
 *
 * 右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・押しても何も起きない。
 * 対象を開く導線は通知一覧に一本化してあるので、ここからは進ませない。
 * 音は鳴らさない（design.md 決定13）。
 */
import { onBeforeUnmount, ref } from '#imports';

import SbIcon from '~/components/ui/SbIcon.vue';
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

/**
 * 本家は info / success / warning / error の4色。ここだけ indigo 集約の外に置く。
 * 値は本家の `--status-*` をそのまま使う（ui.md の Visual Language）。
 */
const toneStyle: Record<NotificationTone, { background: string; borderColor: string; color: string }> = {
  info: {
    background: 'var(--status-info-muted)',
    borderColor: 'var(--status-info)',
    color: 'var(--status-info)',
  },
  success: {
    background: 'var(--status-success-muted)',
    borderColor: 'var(--status-success)',
    color: 'var(--status-success)',
  },
  warning: {
    background: 'var(--status-warning-muted)',
    borderColor: 'var(--status-warning)',
    color: 'var(--status-warning)',
  },
  error: {
    background: 'var(--status-error-muted)',
    borderColor: 'var(--status-error)',
    color: 'var(--status-error)',
  },
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
      class="flex items-start gap-2 rounded-md border px-3 py-2"
      :style="{ ...toneStyle[toast.tone], boxShadow: 'var(--shadow-overlay)' }"
      data-testid="toast"
      :data-tone="toast.tone"
    >
      <!-- 中身は1行テキストのみ。件名と本文の区別もリンクも持たない -->
      <p class="flex-1 text-[13px] font-medium break-words">
        {{ toast.projectName }}: {{ toast.title }}
      </p>
      <button
        type="button"
        class="shrink-0 opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2"
        :aria-label="`${toast.title} の通知を閉じる`"
        data-testid="toast-dismiss"
        @click="dismiss(toast.id)"
      >
        <SbIcon name="x" :size="16" />
      </button>
    </div>
  </div>
</template>
