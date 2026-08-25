<script setup lang="ts">
/**
 * 通知トースト。本家 spec-workflow-mcp と同じ形にする（specs/notification-toast）。
 *
 * 右上固定・縦積み・5秒で自動消滅・× で手動消滅・1行テキスト・押しても何も起きない。
 * 対象を開く導線は通知一覧に一本化してあるので、ここからは進ませない。
 * 音は鳴らさない（design.md 決定13）。
 *
 * 描画は @nuxt/ui が持つ。`app.vue` の `<UApp :toaster>` が `UToaster` を出し、ここは
 * `onNotification` → `toast.add()` の変換と、tone → 本家の色クラスの対応だけを持つ
 * （design.md 決定8）。トーストの markup・timer・手動 dismiss は自前で書かない。
 *
 * **この component を `app.vue` 直下から外さないこと。** `useBoardSocket` は
 * `createSharedComposable`（参照カウント式）で、ここの常駐購読が消えると接続ごと
 * 捨てられる（design.md 決定1）。markup を持たなくなっても置き場としては残る。
 *
 * 見た目の出どころは本家 `modules/notifications/NotificationProvider.tsx` の
 * `NotificationToasts`。`ui.md` の Visual Language が「トーストだけは indigo 集約の外で、
 * `*-50/-200/-800` とダーク時 `*-900/20` の組み合わせ」と書いているのはこの実装のこと。
 * 本家と同じ Tailwind の階調をそのまま使うので、`--status-*` は経由しない。
 */
import { useToast } from '#imports';

import { useBoardSocket } from '~/composables/shared/useBoardSocket';
import type { NotificationTone } from '#shared/types';

/** 本家と同じ 5 秒 */
const AUTO_DISMISS_MS = 5_000;

/**
 * 本家の4種。枠・背景・文字・アイコンの色の組み合わせを本家からそのまま写している。
 * ダーク時だけを持てばよいわけではないので、明暗の両方を本家と同じクラスで持つ。
 *
 * `ring-0` は @nuxt/ui の toast が既定で持つ `ring` を消すため。本家は `border` 1本で
 * 縁を描くので、ring を残すと縁が二重になる。
 * `color` は focus の輪郭にだけ効く（背景・文字・アイコンは下の class が上書きする）。
 */
const TONE = {
  info: {
    color: 'info',
    glyph: 'info-circle',
    surface: 'bg-blue-50 border border-blue-200 ring-0 dark:bg-blue-900/20 dark:border-blue-800',
    text: 'text-blue-800 dark:text-blue-200',
    icon: 'text-blue-500',
  },
  success: {
    color: 'success',
    glyph: 'check-circle',
    surface: 'bg-green-50 border border-green-200 ring-0 dark:bg-green-900/20 dark:border-green-800',
    text: 'text-green-800 dark:text-green-200',
    icon: 'text-green-500',
  },
  warning: {
    color: 'warning',
    glyph: 'alert-triangle',
    surface:
      'bg-yellow-50 border border-yellow-200 ring-0 dark:bg-yellow-900/20 dark:border-yellow-800',
    text: 'text-yellow-800 dark:text-yellow-200',
    icon: 'text-yellow-500',
  },
  error: {
    color: 'error',
    glyph: 'alert-circle',
    surface: 'bg-red-50 border border-red-200 ring-0 dark:bg-red-900/20 dark:border-red-800',
    text: 'text-red-800 dark:text-red-200',
    icon: 'text-red-500',
  },
  // 種別名は `upstream:` コレクションが持つ名前のまま渡す。ここで別名に変えない
} as const satisfies Record<
  NotificationTone,
  { color: string; glyph: string; surface: string; text: string; icon: string }
>;

const toast = useToast();
const { onNotification } = useBoardSocket();

onNotification((notification) => {
  const tone = TONE[notification.tone];

  /**
   * × ボタンに渡すもの。
   *
   * `aria-label` を `close` に載せるのは、`UToast` が `:aria-label="t('toast.close')"` を
   * 書いた直後に `v-bind="props.close"` を展開するため。後から展開される側が勝つので、
   * 既定の英語 "Close" をボタン1つだけ差し替えられる
   * （node_modules/@nuxt/ui/dist/runtime/components/Toast.vue の 121〜122 行）。
   * `UApp :locale` を触ると他画面の文言まで巻き込むので採らない。
   *
   * 変数に切り出しているのは型の都合。@nuxt/ui は `ButtonProps` が受ける HTML 属性を
   * `types/html.d.ts` の `Pick<VueButtonHTMLAttributes, 'autofocus' | 'disabled' | …>` に
   * 絞っており、ARIA 属性が1つも入っていない。Vue のフォールスルー属性としてボタンには
   * 確実に届く（実 DOM で確認済み）が、リテラルを直に書くと余剰プロパティ検査に掛かる。
   */
  const close = {
    'aria-label': `${notification.title} の通知を閉じる`,
    ui: { leadingIcon: 'size-4' },
  };

  toast.add({
    // 中身は1行テキストのみ。`description` も `actions` も載せない（件名と本文の区別を作らない）
    title: `${notification.projectName}: ${notification.title}`,
    icon: `upstream:${tone.glyph}`,
    color: tone.color,
    duration: AUTO_DISMISS_MS,
    // 本家に進捗バーは無い
    progress: false,
    // × の絵も本家から写したもの。@nuxt/ui の既定（lucide）に流れさせない
    closeIcon: 'upstream:close',
    close,
    ui: {
      // `gap-2` は本家の `space-x-2`。既定の `gap-2.5` だと絵と文字の間が広がる
      root: `gap-2 ${tone.surface} ${tone.text}`,
      icon: `mt-0.5 ${tone.icon}`,
      // 既定の `text-highlighted` を本家の階調で上書きする
      title: `text-sm font-medium break-words ${tone.text}`,
      close: 'ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
    },
    // `onClick` を渡さない。渡さなければ本体クリックは何も起こさず、cursor も変わらない
  });
});
</script>

<template>
  <!--
    描画は `app.vue` の `<UApp :toaster>` が持つ。ここは常駐して購読を保つためだけに置く
    （design.md 決定1）。要素を出さないことがこの component の正しい姿。
  -->
</template>
