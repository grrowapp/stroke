<script setup lang="ts">
import { computed } from '#imports';

const heading = computed(() => 'stroke-board');
</script>

<template>
  <main class="p-6">
    <h1 class="text-xl font-semibold">{{ heading }}</h1>
  </main>
</template>
