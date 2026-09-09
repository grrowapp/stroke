<script setup lang="ts">
// 概要入力（セッション開始前）。ここにはまだセッションが無い。
// U1 は id を発行して即返す（最初の問いは待たない）。id が付いたら画面1 へ移る。
//
// 器は `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。中身と流れは変えない。

definePageMeta({ layout: 'stroke' })

const waiting = ref(false)
const errorMessage = ref('')

async function start(overview: string) {
  if (waiting.value) return
  waiting.value = true
  errorMessage.value = ''

  let sessionId: string
  try {
    const created = await $fetch<{ sessionId: string }>('/api/sessions', {
      method: 'POST',
      body: { overview },
    })
    sessionId = created.sessionId
  } catch {
    errorMessage.value = 'セッションを開始できませんでした。もう一度投稿してください。'
    waiting.value = false
    return
  }

  // 受理と起動は分かれている(specs/api/overview)。成功応答の直後に起動を要求する
  // (design.md 決定6)。起動に失敗しても、セッション自体は作られている。
  try {
    await $fetch(`/api/sessions/${sessionId}/invoke-agent`)
  } catch {
    errorMessage.value = 'AI を起動できませんでした。もう一度投稿してください。'
    waiting.value = false
    return
  }

  await navigateTo(`/strokes/${sessionId}`)
}
</script>

<template>
  <div class="sb-stroke-page">
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
