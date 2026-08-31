<script setup lang="ts">
// 画面1(ストローク)。uuid は URL で持つ。
// 今の1問は W1(WS)で受信して描画する。往復の結果は endpoint への返り値には載らない
// (design.md 決定2・6)。待機・失敗は U2 のポーリングで拾う(task 6.3)。
// 器は `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。どの場面に居るかは
// URL が持つので、リロードすれば同じ途中画面がモーダルとして開き直る（design.md D1）。
import type { Answer, Phase, Question, SessionStatus, Stroke } from '#shared/stroke'

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

// W1 `/ws/question` を購読する。届くのは今の1問で、最後の1件で上書きされる。
const question = useSessionChannel<Question>(sessionId, 'question')
const waitingRetry = useWaitingRetry(sessionId)

const errorMessage = ref(loadError.value && !notFound ? 'セッションを読み込めませんでした。' : '')

// この面でここまでに答えた数。総数は持たない(AI が決めるため事前に分からない)。
// 数え方は画面2 の `useAgentQuestion.answered` と同じで、受理が通った回数を数える。
const answered = ref(0)

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
  answered.value += 1

  // 受理と起動は分かれている(specs/api/answer)。成功応答の直後に起動を要求する
  // (design.md 決定6)。cwd は U2 が返した path を渡す——endpoint に導出させない
  // (design.md D5)。
  //
  // **409（前の claude がまだ走っている）は失敗ではない。** 契約どおりの正常な結果で、
  // 走っている claude がこの回答を拾って次の問いを出す。理由を見ずに一律で
  // 「AI を起動できませんでした。」を出していたため、ユーザーは同じ問いに二度答える
  // しかなくなっていた（実測: `strokes.json` に回答が重複）。`requestRun` が待機へ倒す
  const run = await waitingRetry.requestRun(status.value?.path)
  if (!run.ok) {
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

    <!-- 問いの面。オーバーレイの外殻を持たず、この画面に素置きする(design 決定3)。
         待機は面の中で示され、そのあいだ回答欄も送信も出ないので追加送信できない。
         問いも待機も無いあいだは面ごと出さない(問いが届く前に「問いがありません」を
         出さないため)。終端に達したときは面を畳み、上の回復操作だけを見せる -->
    <AgentQuestion
      v-if="(waitingRetry.waiting.value || question) && !waitingRetry.errored.value"
      :question="question"
      :waiting="waitingRetry.waiting.value"
      waiting-message="AI が次を考えています…"
      :answered="answered"
      submit-label="送信"
      @answer="answer"
    />
  </div>
</template>
