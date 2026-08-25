<script setup lang="ts">
// 画面1(ストローク)。uuid は URL で持つ。
// 今の1問は W1(WS)で受信して描画する。往復の結果は endpoint への返り値には載らない
// (design.md 決定2・6)。待機・失敗は U2 のポーリングで拾う(task 6.3)。
import type { Answer, Invocation, Phase, Question, Stroke } from '#shared/stroke'

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
  `/api/strokes/${sessionId}`,
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
  await navigateTo(`/strokes/${sessionId}/proposal`)
}

const { data: strokesData } = await useFetch<{ strokes: Stroke[] }>(`/api/strokes/${sessionId}/strokes`, {
  key: `strokes:${sessionId}`,
})
const strokes = ref<Stroke[]>(strokesData.value?.strokes ?? [])

// W1 `/ws/question` を購読する。届くのは今の1問で、最後の1件で上書きされる。
const question = useSessionChannel<Question>(sessionId, 'question')
const waitingRetry = useWaitingRetry(sessionId)

const errorMessage = ref(loadError.value && !notFound ? 'セッションを読み込めませんでした。' : '')

// この面でここまでに答えた数。総数は持たない(AI が決めるため事前に分からない)。
// 数え方は画面2 の `useAgentQuestion.answered` と同じで、受理が通った回数を数える。
const answered = ref(0)

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
    const current = await $fetch<{ phase: Phase }>(`/api/strokes/${sessionId}`)
    if (current.phase !== 'stroking') {
      await navigateTo(`/strokes/${sessionId}/proposal`)
    }
  },
)

async function answer(given: Answer) {
  const asked = question.value
  if (waitingRetry.waiting.value || !asked) return
  errorMessage.value = ''
  try {
    await $fetch(`/api/strokes/${sessionId}/answer`, { method: 'POST', body: given })
  } catch {
    errorMessage.value = '送信に失敗しました。もう一度送ってください。'
    return
  }
  strokes.value = [...strokes.value, { proposal: false, question: asked, answer: given }]
  answered.value += 1

  // 受理と起動は分かれている(specs/api/answer)。成功応答の直後に起動を要求する
  // (design.md 決定6)。
  try {
    await $fetch(`/api/strokes/${sessionId}/invoke-agent`)
    waitingRetry.startWaiting()
  } catch {
    errorMessage.value = 'AI を起動できませんでした。'
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

    <!-- 問いの面。オーバーレイの外殻を持たず、この画面に素置きする(design 決定3)。
         待機は面の中で示され、そのあいだ回答欄も送信も出ないので追加送信できない。
         問いも待機も無いあいだは面ごと出さない(問いが届く前に「問いがありません」を
         出さないため) -->
    <AgentQuestion
      v-if="waitingRetry.waiting.value || question"
      :question="question"
      :waiting="waitingRetry.waiting.value"
      waiting-message="AI が次を考えています…"
      :answered="answered"
      submit-label="送信"
      @answer="answer"
    />
  </div>
</template>
