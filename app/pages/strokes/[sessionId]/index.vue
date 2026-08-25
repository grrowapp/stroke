<script setup lang="ts">
// 画面1(ストローク)。uuid は URL で持つ。
// 今の1問は W1(WS)で受信して描画する。往復の結果は endpoint への返り値には載らない
// (design.md 決定2・6)。待機・失敗は U2 のポーリングで拾う(task 6.3)。
// 器は `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。どの場面に居るかは
// URL が持つので、リロードすれば同じ途中画面がモーダルとして開き直る（design.md D1）。
import type { Answer, Phase, SessionStatus, Stroke } from '#shared/stroke'

definePageMeta({ layout: 'stroke' })

const route = useRoute()
const sessionId = String(route.params.sessionId)

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const status = error.statusCode
    if (typeof status === 'number') return status
  }
  return undefined
}

const { data: status, error: loadError } = await useFetch<SessionStatus>(
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

const { question } = useQuestionChannel(sessionId)
const waitingRetry = useWaitingRetry(sessionId)

const errorMessage = ref(loadError.value && !notFound ? 'セッションを読み込めませんでした。' : '')

// 初期表示: reload 直後などで実行中・失敗・終端のことがある(U2 の契約)
if (status.value?.invocation === 'running') {
  waitingRetry.startWaiting()
} else if (status.value?.invocation === 'failed') {
  waitingRetry.failed.value = true
} else if (status.value?.invocation === 'error') {
  waitingRetry.errored.value = true
}

/** 終端からの回復。再実行はリトライ回数を戻して起こし直す。 */
async function retry() {
  errorMessage.value = ''
  try {
    await waitingRetry.retryFromError()
  } catch {
    errorMessage.value = 'AI を起動できませんでした。'
  }
}

/** 終端からの回復のもう一方。消したら一覧へ戻る。 */
async function discard() {
  errorMessage.value = ''
  try {
    await waitingRetry.discard()
  } catch {
    errorMessage.value = 'セッションを削除できませんでした。'
    return
  }
  await navigateTo('/projects')
}

// 新しい問いが届いたら待機を終える(通常はこちらが W1 の配信で先に決着する)
watch(question, (q) => {
  if (q) waitingRetry.stopWaiting()
})

// 待機が終わったのに新しい問いが届いていない = proposal が出た。phase を確かめて画面2へ。
watch(
  () => waitingRetry.waiting.value,
  async (isWaiting, wasWaiting) => {
    if (!wasWaiting || isWaiting || waitingRetry.failed.value || waitingRetry.errored.value) return
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

  // 受理と起動は分かれている(specs/api/answer)。成功応答の直後に起動を要求する
  // (design.md 決定6)。cwd は U2 が返した path を渡す——endpoint に導出させない
  // (design.md D5)。
  try {
    await $fetch(`/api/strokes/${sessionId}/invoke-agent`, {
      query: { cwd: status.value?.path },
    })
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

    <!--
      終端（リトライ上限に達した）。システムは自動では何もしないので、ユーザーが
      再実行か削除を選ぶまでここで止まる（openspec/specs/agent/invocation）。
    -->
    <UAlert
      v-if="waitingRetry.errored.value"
      class="mb-6"
      color="error"
      variant="subtle"
      title="AI の起動を繰り返しましたが応答が得られませんでした"
      description="このセッションは自動では再開しません。もう一度試すか、削除してください。"
      data-testid="invocation-error"
    >
      <template #actions>
        <UButton color="error" variant="solid" data-testid="invocation-retry" @click="retry">
          もう一度試す
        </UButton>
        <UButton color="neutral" variant="ghost" data-testid="invocation-discard" @click="discard">
          削除する
        </UButton>
      </template>
    </UAlert>

    <!-- 応答待ち。待機中は問いも回答欄も出さないので追加送信できない -->
    <WaitingIndicator v-if="waitingRetry.waiting.value" message="AI が次を考えています…" class="py-32" />

    <StrokeQuestionCard
      v-else-if="question && !waitingRetry.errored.value"
      :question="question"
      @answer="answer"
    />
  </div>
</template>
