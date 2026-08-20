<script setup lang="ts">
// 画面1(ストローク)。uuid は URL で持つ。
// 今の1問は W1(WS)で受信して描画する。往復の結果は endpoint への返り値には載らない
// (design.md 決定2・6)。待機・失敗は U2 のポーリングで拾う(task 6.3)。
import type { Answer, Invocation, Phase, Stroke } from '#shared/types'

const route = useRoute()
const sessionId = String(route.params.sessionId)

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const status = error.statusCode
    if (typeof status === 'number') return status
  }
  return undefined
}

const { data: status, error: loadError } = await useFetch<{ phase: Phase; invocation: Invocation }>(
  `/api/${sessionId}`,
  { key: `status:${sessionId}` },
)

// `return navigateTo(...)` は書けない: <script setup> の直下の return は
// @vue/compiler-sfc が "'return' outside of function" で弾く(実測)。
const notFound = statusOf(loadError.value) === 404
if (notFound) {
  await navigateTo('/')
}

// U2 が問いを持たない局面(proposed 以降)は画面2 へ送る
if (status.value && status.value.phase !== 'stroking') {
  await navigateTo(`/s/${sessionId}/proposal`)
}

const { data: strokesData } = await useFetch<{ strokes: Stroke[] }>(`/api/${sessionId}/strokes`, {
  key: `strokes:${sessionId}`,
})
const strokes = ref<Stroke[]>(strokesData.value?.strokes ?? [])

const { question } = useQuestionChannel(sessionId)
const waitingRetry = useWaitingRetry(sessionId)

const errorMessage = ref(loadError.value && !notFound ? 'セッションを読み込めませんでした。' : '')

// 初期表示: reload 直後などで実行中・失敗のことがある(U2 の契約)
if (status.value?.invocation === 'running') {
  waitingRetry.startWaiting()
} else if (status.value?.invocation === 'failed') {
  waitingRetry.failed.value = true
}

// 新しい問いが届いたら待機を終える(通常はこちらが W1 の配信で先に決着する)
watch(question, (q) => {
  if (q) waitingRetry.stopWaiting()
})

// 待機が終わったのに新しい問いが届いていない = proposal が出た。phase を確かめて画面2へ。
watch(
  () => waitingRetry.waiting.value,
  async (isWaiting, wasWaiting) => {
    if (!wasWaiting || isWaiting || waitingRetry.failed.value) return
    const current = await $fetch<{ phase: Phase }>(`/api/${sessionId}`)
    if (current.phase !== 'stroking') {
      await navigateTo(`/s/${sessionId}/proposal`)
    }
  },
)

async function answer(given: Answer) {
  const asked = question.value
  if (waitingRetry.waiting.value || !asked) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/${sessionId}/answer`, { method: 'POST', body: given })
    strokes.value = [...strokes.value, { proposal: false, question: asked, answer: given }]
    waitingRetry.startWaiting()
  } catch {
    errorMessage.value = '送信に失敗しました。もう一度送ってください。'
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-14 pb-40">
    <!-- 履歴は常に見えている。開閉を挟まないと辿れない形にしない -->
    <StrokeBreadcrumb class="mb-8" current="question" :strokes="strokes" />

    <UAlert
      v-if="errorMessage"
      class="mb-6"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />

    <UAlert
      v-if="waitingRetry.failed.value"
      class="mb-6"
      color="warning"
      variant="subtle"
      title="AI からの応答が得られませんでした。もう一度送信してください。"
    />

    <!-- 応答待ち。待機中は問いも回答欄も出さないので追加送信できない -->
    <WaitingIndicator v-if="waitingRetry.waiting.value" message="AI が次を考えています…" class="py-32" />

    <StrokeQuestionCard v-else-if="question" :question="question" @answer="answer" />
  </div>
</template>
