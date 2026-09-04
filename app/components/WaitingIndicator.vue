<script setup lang="ts">
// AI の応答待ちの表示。点滅と形はここで揃え、文言は場面ごとに示す側が与える。
// 余白は置き場所によって変わるため、呼ぶ側が class で足す。
defineProps<{ message: string }>()
</script>

<template>
  <p class="sb-stroke-blink text-center text-sm text-muted" role="status" aria-live="polite">
    {{ message }}
  </p>
</template>
