<script setup lang="ts">
// 概要入力（セッション開始前）。ここにはまだセッションが無い。
// U1 は id を発行して即返す（最初の問いは待たない）。id が付いたら画面1（/s/<uuid>）へ移る。

const waiting = ref(false)
const errorMessage = ref('')

async function start(overview: string) {
  if (waiting.value) return
  waiting.value = true
  errorMessage.value = ''
  try {
    const { sessionId } = await $fetch<{ sessionId: string }>('/api/overview', {
      method: 'POST',
      body: { overview },
    })
    await navigateTo(`/s/${sessionId}`)
    return
  } catch {
    errorMessage.value = 'セッションを開始できませんでした。もう一度投稿してください。'
  }
  waiting.value = false
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-14 pb-40">
    <UAlert
      v-if="errorMessage"
      class="mb-6"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />

    <WaitingIndicator v-if="waiting" message="セッションを開始しています…" class="py-32" />

    <StrokeOverviewForm v-else @submit="start" />
  </div>
</template>
