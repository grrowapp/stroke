<script setup lang="ts">
// 概要入力（セッション開始前）。ここにはまだセッションが無い。
// 投稿でセッションを作り、uuid を載せた画面1（/s/<uuid>）へ移る。
import type { SessionView } from '#shared/types'

const waiting = ref(false)
const errorMessage = ref('')

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const status = error.statusCode
    if (typeof status === 'number') return status
  }
  return undefined
}

async function start(overview: string) {
  if (waiting.value) return
  waiting.value = true
  errorMessage.value = ''
  try {
    const view = await $fetch<SessionView>('/api/sessions', {
      method: 'POST',
      body: { overview },
    })
    await navigateTo(`/s/${view.sessionId}`)
    return
  } catch (error) {
    // 契約: 502 は AI から応答が得られなかったとき
    errorMessage.value =
      statusOf(error) === 502
        ? 'AI から応答が得られませんでした。もう一度投稿してください。'
        : 'セッションを開始できませんでした。もう一度投稿してください。'
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

    <!-- 投稿すると AI が最初の問いを起こす。その待ちは画面1 と同じ形で出す -->
    <WaitingIndicator v-if="waiting" message="AI が次を考えています…" class="py-32" />

    <StrokeOverviewForm v-else @submit="start" />
  </div>
</template>
