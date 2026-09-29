<script setup lang="ts">
// ストローク開始。画面の実体は `components/page/Stroke/Start/Container.vue`。
// 画面を包む部品は `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。

definePageMeta({ layout: 'stroke' })
</script>

<template>
  <Suspense>
    <PageStrokeStartContainer />
  </Suspense>
</template>
