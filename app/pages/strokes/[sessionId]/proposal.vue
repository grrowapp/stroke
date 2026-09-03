<script setup lang="ts">
// 画面2(proposal 確認)。ui.md の採用案 = B(右パネル常設)。
// 決める操作(差し戻す・承認)はビュー切替と同じ上部固定バーに集約する。
// 差し戻し後の問い返しは画面1 へ戻さず、この画面の帯とモーダルで受ける。
import MarkdownSource from '#markdown/render/MarkdownSource.vue'
import MarkdownView from '#markdown/render/MarkdownView.vue'

import { isPromotedPhase, type Phase, type SessionStatus, type Stroke } from '#shared/stroke'

// 器は `stroke` レイアウト（fullscreen の UModal・閉じ操作なし）。承認すると
// モーダルごと閉じて一覧へ戻る。
definePageMeta({ layout: 'stroke' })

// セッション uuid は URL に載る(/s/<uuid>/proposal)。cookie では持たない。
const route = useRoute()
const rawId = route.params.sessionId
const sessionId = Array.isArray(rawId) ? (rawId[0] ?? '') : (rawId ?? '')

const { data: status, error } = await useFetch<SessionStatus>(
  `/api/strokes/${sessionId}`,
  { key: `status:${sessionId}` },
)

// 契約: 404 は存在しないセッション。概要入力へ戻す。
// <script setup> の直下では return できない(ES module のトップレベル return は構文エラー)ため、
// リダイレクトを起こしたうえで以降を無害にする。notFound の間は本文を描画しない。
const notFound = computed(() => error.value?.statusCode === 404)
if (notFound.value) {
  await navigateTo('/', { replace: true })
}

// エッジケース: proposal がまだ無い局面(stroking)での URL 直打ち・ブックマーク。
// 画面2 には proposal が無いため、画面1 へ戻す。
if (status.value && status.value.phase === 'stroking') {
  await navigateTo(`/strokes/${sessionId}`)
}

const { data: strokesData } = await useFetch<{ strokes: Stroke[] }>(`/api/strokes/${sessionId}/strokes`, {
  key: `strokes:${sessionId}`,
})

const review = useProposalReview(sessionId, {
  phase: status.value?.phase ?? 'proposed',
  strokes: strokesData.value?.strokes ?? [],
})

const {
  phase,
  strokes,
  proposal,
  projectName,
  comments,
  viewMode,
  notice,
  busy,
  sendingBack,
  awaitingFollowup,
  followupQuestion,
  followupOpen,
  followupWaiting,
  answered,
  deleteId,
  promotionFailed,
  promotionNotice,
} = review

const hasProposal = computed(() => !!proposal.value)
// 昇格後（`approved` / `activated`）は承認済みの見せ方。画面2が扱うのは `proposed` までで、
// 昇格後の URL に来たときの読み取り専用の面である（specs/stroke/frontier）
const approved = computed(() => phase.value != null && isPromotedPhase(phase.value))

// 承認後は注釈も差し戻しもしないため、整形されたプレビューだけを見せる
const shownMode = computed(() => (approved.value ? 'preview' : viewMode.value))

// 見せ方は2つ。どちらでも指摘を付けられるので、両方を並べる面は無い（specs/stroke/frontier）
const modes = [
  { value: 'preview', label: 'プレビュー' },
  { value: 'annotate', label: '注釈' },
] as const

// 注釈の面へ渡す位置の口。面はどちらも `PositionPort` を `defineExpose` で名乗るので、
// `ref` をそのまま渡す。出ていない面の `ref` は null
const previewSurface = useTemplateRef<InstanceType<typeof MarkdownView>>('previewSurface')
const sourceSurface = useTemplateRef<InstanceType<typeof MarkdownSource>>('sourceSurface')

// 一覧のコメント → 本文の範囲。出ている面の注釈の面へ渡す（面は同時に1つしか出ないので
// `ref` は1つでよい）
const annotator = useTemplateRef<{ reveal: (id: string) => boolean }>('annotator')
</script>

<template>
  <div v-if="!notFound">
    <!-- 上部固定バー: パンくず / ビュー切替 / 差し戻す / 承認して作る -->
    <!-- 差し戻し中はバーを薄くし、さわれない状態にする -->
    <header
      class="sticky top-0 z-20 border-b border-default bg-default/95 backdrop-blur"
      :class="sendingBack ? 'pointer-events-none opacity-50' : ''"
    >
      <div class="flex items-center justify-between gap-4 px-6 py-3">
        <StrokeBreadcrumb current="proposal" :strokes="strokes" class="min-w-0" />

        <div v-if="hasProposal" class="flex shrink-0 items-center gap-2">
          <div v-if="!approved" class="flex gap-1">
            <UButton
              v-for="m in modes"
              :key="m.value"
              size="xs"
              :color="viewMode === m.value ? 'primary' : 'neutral'"
              :variant="viewMode === m.value ? 'solid' : 'ghost'"
              @click="viewMode = m.value"
            >{{ m.label }}</UButton>
          </div>

          <template v-if="!approved">
            <div class="mx-1 h-5 w-px bg-[var(--ui-border)]" />

            <UButton size="sm" color="neutral" variant="subtle" :disabled="busy" @click="review.sendBack">
              差し戻す({{ comments.length }})
            </UButton>
            <UButton size="sm" :disabled="busy" @click="review.openApprove">承認して作る</UButton>
          </template>
        </div>
      </div>
    </header>

    <!-- 差し戻し中の待ち受け画面。上部固定バーは残し、本文の代わりに点滅する文言を全面に出す -->
    <div v-if="sendingBack" class="flex min-h-[calc(100vh-var(--sb-stroke-bar-h))] items-center justify-center">
      <WaitingIndicator message="AI が修正中です" />
    </div>

    <template v-else>
    <!-- AI からの問い返しだけは点滅させて他の表示と区別する -->
    <button
      v-if="awaitingFollowup"
      type="button"
      class="blink w-full border-b border-warning bg-warning/10 px-6 py-2 text-left text-sm font-medium text-warning hover:bg-warning/20"
      @click="review.openFollowup"
    >
      AI から質問があります。ここを押して答えてください
    </button>

    <div
      v-else-if="approved"
      class="border-b border-default bg-primary/5 px-6 py-2 text-sm text-primary"
    >
      承認済みです。プロジェクト「{{ projectName }}」が作られました。
    </div>

    <div
      v-else-if="notice === 'revised'"
      class="border-b border-default bg-primary/5 px-6 py-2 text-sm text-primary"
    >
      差し戻しを受けて proposal が出し直されました
    </div>

    <div v-if="!hasProposal" class="px-6 py-16 text-center text-sm text-muted">
      まだ proposal はありません。フロンティアが空になると AI が proposal を起こします。
    </div>

    <div
      v-else
      class="grid min-h-[calc(100vh-var(--sb-stroke-bar-h))] grid-cols-1"
      :class="approved ? '' : 'lg:grid-cols-[minmax(0,1fr)_400px]'"
    >
      <section class="min-w-0">
        <!--
          承認後: 整形されたプレビューを読むだけ。注釈も差し戻しもしないので、注釈の面に
          載せない。

          本文の型は markdown モジュールが持つ。`surface` を寝かせるのは、この画面が
          自前の余白（`px-8 py-8`）を持つ別レイアウトで、本家写しの暗い矩形を重ねると
          枠と余白が二重になるため。
        -->
        <MarkdownView
          v-if="approved"
          :value="proposal"
          :surface="false"
          testid="proposal-preview"
          class="px-8 py-8"
        />

        <!--
          プレビュー: 整形された本文。ここからも指摘を付けられる。

          注釈の面（`ReviewAnnotateSource`）は本文をどう描くかを知らない。面はスロットで
          渡し、位置の口は面の `ref` で渡す。図に生テキストを添えたい範囲（`sourceShown`）は
          注釈の面がスロットから出すので、`MarkdownView` の同名の prop へそのまま通す。
        -->
        <ReviewAnnotateSource
          v-else-if="shownMode === 'preview'"
          ref="annotator"
          v-slot="{ sourceShown }"
          :source="proposal"
          :comments="comments"
          :port="previewSurface"
          @select="review.onSelect"
          @click-mark="review.editComment"
        >
          <MarkdownView
            ref="previewSurface"
            :value="proposal"
            :surface="false"
            :source-shown="sourceShown"
            testid="proposal-preview"
            class="px-8 py-8"
          />
        </ReviewAnnotateSource>

        <!--
          生テキスト: 書いてある通りの字。こちらでも同じ注釈が出て、同じように付けられる。

          余白はプレビューと同じ `px-8 py-8`。**切り替えで同じ場所に出る**ので、違えると
          `shownMode` を切り替えた瞬間に本文の左端が飛ぶ（change `adopt-upstream-design-tokens`）。
        -->
        <ReviewAnnotateSource
          v-else
          ref="annotator"
          :source="proposal"
          :comments="comments"
          :port="sourceSurface"
          class="px-8 py-8"
          @select="review.onSelect"
          @click-mark="review.editComment"
        >
          <MarkdownSource
            ref="sourceSurface"
            :value="proposal"
            :surface="false"
            testid="proposal-source"
          />
        </ReviewAnnotateSource>
      </section>

      <aside
        v-if="!approved"
        class="flex flex-col border-l border-default bg-elevated/40 lg:sticky lg:top-[var(--sb-stroke-bar-h)] lg:h-[calc(100vh-var(--sb-stroke-bar-h))]"
      >
        <div class="border-b border-default px-5 py-4">
          <h4 class="mb-3 text-sm font-medium">コメント({{ comments.length }})</h4>
          <UButton block size="sm" @click="review.openGeneral">＋ 全体へのコメント</UButton>
        </div>

        <div class="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p v-if="!comments.length" class="py-8 text-center text-sm text-muted">
            まだコメントがありません<br>
            <span class="text-xs">
              本文を選ぶと、その箇所にコメントを付けられます。<br>
              箇所に紐づかない指摘は「＋ 全体へのコメント」から付けられます。
            </span>
          </p>
          <ReviewCommentCard
            v-for="c in comments"
            :key="c.id"
            :comment="c"
            @edit="review.editComment"
            @remove="deleteId = $event"
            @locate="annotator?.reveal($event)"
          />
        </div>
      </aside>
    </div>

    <ReviewModals :review="review" />

    <!-- 問い返しはこの画面の上にオーバーレイで開く。答え終わるまで閉じない:
         ESC・背景クリック(:dismissible="false")も閉じるボタン(:close="false")も
         受け付けない。幅は画面を覆い切らない大きさに留め、背後の本文を残す。
         中身は画面1 と同じ `AgentQuestion` で、送信ボタンもその中にある
         (design 決定3)。footer には注記だけを置く。

         body の既定は `overflow-y-auto` で、body そのものがスクロールする。それだと
         問いが長いとき送信ボタンが下へ流れて押せなくなるので、body 側のスクロールを
         止めて縦の flex にし、スクロールは `AgentQuestion` の中の「問いの中身」だけに
         任せる(tasks 6.7)。ボタンはそのスクロール領域の外に残るので常に見える -->
    <UModal
      v-model:open="followupOpen"
      title="AI からの質問"
      :dismissible="false"
      :close="false"
      :ui="{ content: 'max-w-2xl', body: 'flex min-h-0 flex-col overflow-y-hidden' }"
    >
      <template #body>
        <AgentQuestion
          :question="followupQuestion"
          :waiting="followupWaiting"
          waiting-message="AI が次を考えています…"
          :answered="answered"
          submit-label="答える"
          @answer="review.answerFollowup"
        />
      </template>

      <template #footer>
        <span class="text-xs text-muted">答えると、AI がさらに聞いてくることがあります</span>
      </template>
    </UModal>
    </template>

    <!--
      昇格に失敗したときの決着。器は一覧の決着と同じで、選択肢の指す先だけが違う——
      この時点ではプロジェクトが無く phase は `proposed` なので、破棄はセッション側、
      やり直すは再承認になる（specs/project/generation）。
    -->
    <ProjectCreationNotice
      :name="promotionNotice"
      outcome="failed"
      @done="review.promotionNoticeDone"
    />
    <ProjectCreationChoiceModal
      :name="promotionFailed"
      outcome="failed"
      :can-review="false"
      :busy="false"
      @retry="review.retryPromotion"
      @discard="review.discardSession"
    />
  </div>
</template>
