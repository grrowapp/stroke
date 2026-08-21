<script setup lang="ts">
// auto-import を使わないため `#imports` から明示的に取る（structure.md の Import Patterns）。
import { useHead } from '#imports';

useHead({ title: 'stroke-board' });
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
