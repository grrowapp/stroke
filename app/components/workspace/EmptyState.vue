<script setup lang="ts">
/**
 * 中身が無いことを示す。本家の Not Created 相当で、無彩色にする
 * （ui.md の Visual Language）。
 */
defineProps<{ testid?: string }>();
</script>

<template>
  <p class="sb-placeholder" :data-testid="testid">
    <slot />
  </p>
</template>
