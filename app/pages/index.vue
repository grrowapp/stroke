<script setup lang="ts">
import { computed } from '#imports';

const heading = computed(() => 'stroke-board');
</script>

<template>
  <main class="min-h-screen bg-default text-default p-6">
    <h1 class="text-xl font-semibold text-highlighted">{{ heading }}</h1>
    <p class="text-muted mt-2">design token の確認用</p>
    <div class="mt-4 border border-default bg-muted rounded p-4">
      <UButton color="primary">primary</UButton>
    </div>
  </main>
</template>
