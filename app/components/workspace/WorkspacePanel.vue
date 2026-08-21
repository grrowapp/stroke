<script setup lang="ts">
/**
 * 下層の画面の外枠。
 *
 * 本家は下層の各画面を1枚のパネルに載せ、その中に見出しと副題を置いてから中身を出す
 * （`SteeringPage.tsx` / `SpecsPage.tsx` の `Content`）。画面ごとに枠を書くと、寸法が
 * 少しずつずれて本家との差が方々に散るので、ここに1つだけ置く。
 *
 * 見出しと副題の間隔・大きさは本家のとおり（見出し `text-lg`、副題 `text-sm` の
 * secondary、見出しブロックの下に 24px）。
 */
defineProps<{ title: string; subtitle?: string; testid?: string }>();
</script>

<template>
  <section class="sb-panel" :data-testid="testid">
    <div class="mb-6 flex items-center justify-between gap-4">
      <div class="min-w-0 flex-1">
        <h1 class="sb-panel-title truncate">{{ title }}</h1>
        <p v-if="subtitle" class="sb-panel-subtitle">{{ subtitle }}</p>
      </div>
      <!-- 見出しの右。本家はここに検索や並び替えを置くが、stroke-board は読むだけ -->
      <slot name="actions" />
    </div>

    <slot />
  </section>
</template>
