<script setup lang="ts">
// 画面1（ストローク）。uuid は URL で持つ。
// AI の最新の問い1つと回答欄だけを出し、往復は画面に積み上げない。済んだ分はパンくずで辿る。
import type { Question, SessionView, Stroke, StrokeResult, Answer } from '#shared/types'

const route = useRoute()
const sessionId = String(route.params.sessionId)

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const status = error.statusCode
    if (typeof status === 'number') return status
  }
  return undefined
}

const { data: session, error: loadError } = await useFetch<SessionView>(
  `/api/sessions/${sessionId}`,
  { key: `session:${sessionId}` },
)

// `return navigateTo(...)` は書けない: <script setup> の直下の return は
// @vue/compiler-sfc が "'return' outside of function" で弾く（実測）。
// そのため await で送り、この下は view が無くても壊れない形にしてある。
const notFound = statusOf(loadError.value) === 404

// 契約: 404 は存在しないセッション。概要入力へ戻す
if (notFound) {
  await navigateTo('/')
}

const view = session.value

// エッジケース: proposal が起きた後の URL 直打ち・ブックマーク・リロード。
// 画面1 には答えるべき問いが無いため、画面1 を描かず画面2 を出す。
if (view?.phase === 'proposed' || view?.phase === 'approved') {
  await navigateTo(`/s/${sessionId}/proposal`)
}

// 問いがあるのは stroking のときだけ（上の分岐で他の phase は画面2 へ送っている）
const stroking = view?.phase === 'stroking' ? view : null

const strokes = ref<Stroke[]>(view?.strokes ?? [])
const question = ref<Question | null>(stroking?.question ?? null)
const waiting = ref(false)
const errorMessage = ref(loadError.value && !notFound ? 'セッションを読み込めませんでした。' : '')

/** 契約: 409 は AI が実行中の追加送信。待機表示のままにする。502 は AI から応答が得られなかった。 */
function report(error: unknown): 'keep-waiting' | 'shown' {
  const status = statusOf(error)
  if (status === 409) return 'keep-waiting'
  errorMessage.value =
    status === 502
      ? 'AI から応答が得られませんでした。もう一度送ってください。'
      : '送信に失敗しました。もう一度送ってください。'
  return 'shown'
}

async function answer(given: Answer) {
  const asked = question.value
  if (waiting.value || !asked) return
  waiting.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<StrokeResult>(`/api/sessions/${sessionId}/answer`, {
      method: 'POST',
      body: { answer: given },
    })
    strokes.value = [...strokes.value, { question: asked, answer: given }]
    if (result.outcome === 'question') {
      question.value = result.question
    } else {
      // 把握完了。AI が proposal を起こしたので画面2 へ移る
      return navigateTo(`/s/${sessionId}/proposal`)
    }
  } catch (error) {
    if (report(error) === 'keep-waiting') return
  }
  waiting.value = false
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

    <!-- 応答待ち。待機中は問いも回答欄も出さないので追加送信できない -->
    <WaitingIndicator v-if="waiting" message="AI が次を考えています…" class="py-32" />

    <StrokeQuestionCard v-else-if="question" :question="question" @answer="answer" />
  </div>
</template>
