<script setup lang="ts">
// 概要入力（セッション開始前）。ここにはまだセッションが無い。
// U1 は id を発行して即返す（最初の問いは待たない）。id が付いたら画面1 へ移る。
//
// `/` と `/strokes` の2つの route がこの画面を出す。中身は1つで、違うのは path だけ
// （`docs/specs/architecture/screen-flow.md`）。
// 画面を包む部品は route 側の `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。

const waiting = ref(false)
const errorMessage = ref('')

/**
 * 起動に失敗したセッションの id。**捨てない。**
 *
 * この段階の失敗は巡回に拾われない——セッションはまだ一覧（U12）に載らないためである
 * （`openspec/specs/stroke/frontier`）。システムが自動で何かをすることはないので、
 * 完全な失敗として扱い、選択肢を出す（`docs/specs/architecture/failure.md`）。
 */
const pendingSessionId = ref('')

/** 「最初からやり直す」の承諾。開いている間は何も消えていない。 */
const confirmingDiscard = ref(false)

async function start(overview: string) {
  if (waiting.value) return
  waiting.value = true
  errorMessage.value = ''
  pendingSessionId.value = ''

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
    errorMessage.value = 'AI を起動できませんでした。'
    pendingSessionId.value = sessionId
    waiting.value = false
    return
  }

  await navigateTo(`/strokes/${sessionId}`)
}

/** そのまま再実行する。概要は投稿済みなので、起動だけをやり直す。 */
async function retryLaunch() {
  if (!pendingSessionId.value) return
  errorMessage.value = ''
  waiting.value = true
  try {
    await $fetch(`/api/strokes/${pendingSessionId.value}/invoke-agent`)
  } catch {
    errorMessage.value = 'AI を起動できませんでした。'
    waiting.value = false
    return
  }
  const sessionId = pendingSessionId.value
  pendingSessionId.value = ''
  await navigateTo(`/strokes/${sessionId}`)
}

/**
 * 最初からやり直す。**承諾を得た後にだけ呼ぶ**（`failure.md`「破壊を伴う選択肢の承諾」）。
 * 消えるのは投稿した概要で、消した後はこの画面のまま入力からやり直せる。
 */
async function discardPending() {
  if (!pendingSessionId.value) return
  errorMessage.value = ''
  try {
    // **URL を `string` として渡す。** `/api/sessions/unfinished`（U16）が静的な兄弟として
  // 増えたことで、`/api/sessions/${…}` の型が GET だけに狭まり、DELETE が通らなくなる
  // （Nitro の typed routes の性質）。実体の route は `sessions/[id]/index.delete.ts` に在る
    await $fetch(`/api/sessions/${pendingSessionId.value}` as string, { method: 'DELETE' })
  } catch {
    errorMessage.value = 'セッションを削除できませんでした。'
    confirmingDiscard.value = false
    return
  }
  pendingSessionId.value = ''
  confirmingDiscard.value = false
}
</script>

<template>
  <div class="sb-stroke-page">
    <UAlert
      v-if="errorMessage && !pendingSessionId"
      class="mb-6"
      color="error"
      variant="subtle"
      :title="errorMessage"
    />

    <!--
      巡回に拾われない失敗。ここで止まったままにしない——選択肢を出し、どちらを選んでも
      先へ進める（`docs/specs/architecture/failure.md`「行き止まりを作らない」）。
      壊す方（やり直す）は警告色で、承諾を挟む。
    -->
    <UAlert
      v-if="pendingSessionId"
      class="mb-6"
      color="error"
      variant="subtle"
      title="AI を起動できませんでした"
      description="概要は保存されています。もう一度起動するか、この概要を捨てて入力からやり直してください。"
      data-testid="launch-error"
    >
      <template #actions>
        <UButton color="error" variant="solid" data-testid="launch-retry" @click="retryLaunch">
          もう一度試す
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          data-testid="launch-discard"
          @click="confirmingDiscard = true"
        >
          最初からやり直す
        </UButton>
      </template>
    </UAlert>

    <UModal v-model:open="confirmingDiscard" title="投稿した概要が削除されます">
      <template #body>
        <p data-testid="launch-discard-warning">
          このセッションは削除され、概要の入力からやり直しになります。取り消せません。
        </p>
      </template>

      <template #footer>
        <UButton color="error" variant="solid" data-testid="launch-discard-confirm" @click="discardPending">
          削除してやり直す
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          data-testid="launch-discard-cancel"
          @click="confirmingDiscard = false"
        >
          やめる
        </UButton>
      </template>
    </UModal>

    <WaitingIndicator v-if="waiting" message="セッションを開始しています…" class="py-32" />

    <StrokeOverviewForm v-else @submit="start" />
  </div>
</template>
