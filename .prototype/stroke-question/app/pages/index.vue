<script setup lang="ts">
// 画面1（ストローク）。縦積みカードの形で確定。
import { sampleQuestion } from '~/data/question'

const answer = ref<{ kind: 'option' | 'free'; value: string } | null>(null)
</script>

<template>
  <div>
    <VariantA v-model="answer" :q="sampleQuestion" />

    <PrototypeSwitcher
      :variants="['A']"
      :names="{ A: '画面1 — 縦積みカード' }"
      current="A"
      :state="answer"
    />
  </div>
</template>
