<script setup lang="ts">
/**
 * 本家 spec-workflow-mcp のアイコン。パスを本家のソースからそのまま持ち込んでいる。
 *
 * prototype 由来のアイコンは `SbIcon.vue` にある。混ぜると、どちらの出どころに合わせて
 * いるのかが後から分からなくなるので、コンポーネントを分けている。
 * 上層は prototype、下層とトーストは本家、という切り分けはこの2つの使い分けで表す。
 *
 * 本家はすべて `w-5 h-5` のようなクラスで大きさを決めているので、ここも属性ではなく
 * クラスで受ける。描画属性（fill / stroke / stroke-width / linecap / linejoin）は
 * 本家の svg と同じ。
 */

export type UpstreamIconName = keyof typeof PATHS;

const PATHS = {
  /** modules/notifications/NotificationProvider.tsx の error */
  'alert-circle': ['M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 同 warning */
  'alert-triangle': [
    'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z',
  ],
  /** 同 success。承認のナビゲーション項目でも本家はこれを使う */
  'check-circle': ['M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 同 info */
  'info-circle': ['M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'],

  /** 文書。SpecsPage / SteeringPage の行頭タイルと nav.specs で使われている */
  document: [
    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  ],
  /** ステアリング。PageNavigationSidebar の nav.steering */
  steering: [
    'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  ],
  /** タスク。SpecsPage の件数表示と nav.tasks */
  tasks: [
    'M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  ],
  /** 最終更新の前に付く時計。SpecsPage の SpecCard */
  clock: ['M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'],
  /** 発生時刻の前に付くカレンダー。ApprovalsPage のカード */
  calendar: [
    'M8 7V3a1 1 0 011-1h6a1 1 0 011 1v4m-6 0h6M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-2',
  ],

  /** 行の右端。本家は「開く」を目のアイコンで表している（2本のパスで1つの絵） */
  eye: [
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  ],
  /** カード表示のときの右端 */
  'chevron-right': ['M9 5l7 7-7 7'],
  /** トーストの閉じる */
  close: ['M6 18L18 6M6 6l12 12'],
} as const;

const props = defineProps<{ name: UpstreamIconName }>();
</script>

<template>
  <svg
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
    :data-upstream-icon="props.name"
  >
    <path
      v-for="d in PATHS[props.name]"
      :key="d"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      :d="d"
    />
  </svg>
</template>
