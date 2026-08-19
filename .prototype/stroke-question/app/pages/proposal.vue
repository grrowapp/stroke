<script setup lang="ts">
// 画面2（proposal 確認）。右パネル常設の形で確定。
// 差し戻し後に AI が問い返してきた場合も、この画面の中で受ける。
const state = ref<Record<string, unknown>>({})
</script>

<template>
  <div>
    <ProposalVariantB v-model="state" />

    <PrototypeSwitcher
      :variants="['B']"
      :names="{ B: '画面2 — 右パネル常設' }"
      current="B"
      :state="state"
    />
  </div>
</template>
