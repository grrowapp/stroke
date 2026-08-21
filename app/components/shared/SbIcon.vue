<script setup lang="ts">
/**
 * prototype（archive の steering-dashboard-portal/prototype/navigation.prototype.html）の
 * アイコン。パスと描画属性をそのまま持ち込んでいる。
 *
 * アイコンセットの選定は決めていないので、勝手に別のものを選ばない。承認された
 * プロトタイプが使っているものが答えである。
 *
 * 元の定義:
 *   const SVG=(d,s=16)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"
 *     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
 *     <path d="${d}"/></svg>`;
 */

export type SbIconName = keyof typeof PATHS;

const PATHS = {
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  folder: 'M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  plus: 'M12 5v14M5 12h14',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  back: 'M15 18l-6-6 6-6',
  down: 'M6 9l6 6 6-6',
  grid: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z',
  x: 'M18 6L6 18M6 6l12 12',
} as const;

const props = withDefaults(defineProps<{ name: SbIconName; size?: number }>(), { size: 16 });
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
    :data-icon="props.name"
  >
    <path :d="PATHS[props.name]" />
  </svg>
</template>
