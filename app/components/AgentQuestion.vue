<script setup lang="ts">
// AI の問いを出し、回答を受け取る面。置かれる画面を知らない。
// $fetch を持たず、props で受けて emit で返すだけ。往復は `useAgentQuestion` の側にある。
//
// 並びは `openspec/specs/agent-question` の規定どおり:
// 話題タグ → 詳細説明 → 問い本文 → 選択肢 → 自由入力欄。
// **この並びと構成は置かれた画面によって変えない。** そのため寸法にも送信ボタンの
// 位置にも分岐（`size` props 等）を持たせない。画面ごとに変わるのは、送信ボタンの
// 文言（`submitLabel`）と待機の文言（`waitingMessage`）だけである
// （design 決定3・決定4）。
//
// オーバーレイの外殻（`UModal`）はここに含めない。素置きにする画面（画面1）と
// モーダルで開く画面（画面2）で外殻が違うため、外殻は置く側が書く。
import type { Answer, Question } from '#shared/stroke'

const props = defineProps<{
  /** 今の1問。まだ届いていなければ null */
  question: Question | null
  /** 次が返るのを待っているか。待機中は追加の送信を受け付けない */
  waiting: boolean
  /** 待機中に出す文言。場面ごとに規定し、置く側が与える（specs/agent-question） */
  waitingMessage: string
  /** ここまでに答えた数。総数は持たない（AI が決めるため事前に分からない） */
  answered: number
  /** 送信ボタンの文言。画面ごとに変わるのはここだけ */
  submitLabel: string
}>()

const emit = defineEmits<{ answer: [answer: Answer] }>()

const picked = ref<string | null>(null)
const free = ref('')
const notice = ref('')

function reset(): void {
  picked.value = null
  free.value = ''
  notice.value = ''
}

// 問いが次に置き換わったら書きかけを持ち越さない。
//
// 「開き直したとき」も同じく空に戻るが、そちらの手当てはここに要らない。モーダルで
// 開く画面（画面2）はこの面を `UModal` の body slot に置いており、`UModal` は既定で
// `unmountOnHide`（reka-ui `DialogRoot` の既定値 true）なので、閉じると body ごと
// 破棄され、開き直すと新しく組み立て直される。ref はそこで初期値に戻る。
watch(() => props.question, reset)

// 選択肢と自由入力は排他。どちらか一方だけが回答になる。
//
// `pick()` で `free` を、`writeFree()` で `picked` を落としているので、両方が同時に
// 埋まっている状態は作られない。したがって下の `send()` がどちらを先に見ても結果は
// 同じである（統合前の2本は優先順位が逆だったが、振る舞いの差は無かった）。
function pick(label: string): void {
  picked.value = label
  free.value = ''
  notice.value = ''
}

function writeFree(value: string): void {
  free.value = value
  if (value) picked.value = null
  notice.value = ''
}

function send(): void {
  if (props.waiting || !props.question) return

  const written = free.value.trim()
  if (written) {
    emit('answer', { kind: 'free', value: written })
    return
  }
  if (picked.value) {
    emit('answer', { kind: 'option', value: picked.value })
    return
  }
  // 選択も自由入力も無いときは送らず、回答が必要である旨を示す
  notice.value = '選択肢を選ぶか、自由入力に書いてください。'
}
</script>

<template>
  <!-- 縦は「問いの中身」と「送信ボタン」の2段。中身だけがスクロールし、ボタンは
       その外に残るので、問いが長くても送信ボタンが流れて押せなくならない
       （tasks 6.7）。高さの制約がある置き方（画面2 の `UModal`）でだけスクロールが
       起き、制約が無い置き方（画面1 の素置き）では中身が伸びるだけで何も変わらない。
       どちらも同じ markup で成立するので、画面ごとの出し分けを持たない -->
  <div class="flex min-h-0 flex-1 flex-col" data-testid="agent-question">
    <!-- 次の問いを待つ間。答える面の中で待機を示す。送信の口ごと消えるので、
         待機中は続けて送れない -->
    <WaitingIndicator
      v-if="props.waiting"
      data-testid="agent-question-waiting"
      :message="props.waitingMessage"
    />

    <template v-else-if="props.question">
      <div class="min-h-0 flex-1 overflow-y-auto" data-testid="agent-question-scroll">
        <!-- 何問目かは出すが、総数は出さない（AI が決めるため事前に分からない） -->
        <div class="mb-4 flex items-center justify-between">
          <span class="text-xs tabular-nums text-muted" data-testid="agent-question-count">
            質問 {{ props.answered + 1 }}
          </span>
          <span v-if="props.answered" class="text-xs text-muted">
            ここまで {{ props.answered }} 問に回答
          </span>
        </div>

        <!-- 話題タグ: その問いが何についてのものか -->
        <UBadge
          class="mb-3"
          size="lg"
          variant="subtle"
          color="neutral"
          data-testid="agent-question-header"
        >
          {{ props.question.header }}
        </UBadge>

        <!-- 詳細説明: 既に確定していること、調べて分かった事実 -->
        <div class="sb-stroke-card mb-4 p-3">
          <p class="mb-1 text-xs font-medium text-muted">詳細説明</p>
          <p
            class="whitespace-pre-wrap text-sm leading-relaxed text-toned"
            data-testid="agent-question-detail"
          >
            {{ props.question.detail }}
          </p>
        </div>

        <!-- 問い本文は詳細説明の下に置く -->
        <h3 class="mb-5 text-lg leading-snug font-semibold" data-testid="agent-question-text">
          {{ props.question.question }}
        </h3>

        <!-- 選択肢。各説明を添え、推奨には印を付ける -->
        <div class="space-y-2">
          <button
            v-for="option in props.question.options"
            :key="option.label"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="
              picked === option.label
                ? 'border-primary bg-primary/5'
                : 'border-default hover:border-inverted/30'
            "
            data-testid="agent-question-option"
            :data-picked="picked === option.label ? 'true' : 'false'"
            @click="pick(option.label)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ option.label }}</span>
              <UBadge
                v-if="option.recommended"
                size="sm"
                variant="subtle"
                data-testid="agent-question-recommended"
              >
                推奨
              </UBadge>
            </div>
            <p class="mt-1 text-sm leading-relaxed text-toned">{{ option.description }}</p>
          </button>
        </div>

        <!-- 自由入力欄は常にある。選択肢は決定を代行する仕掛けではない -->
        <div class="mt-4">
          <p class="mb-1 text-sm font-medium">どれでもない場合</p>
          <UTextarea
            :model-value="free"
            :rows="2"
            class="w-full"
            placeholder="自分の言葉で書く"
            data-testid="agent-question-free"
            @update:model-value="writeFree(String($event))"
          />
        </div>

        <p v-if="notice" class="mt-3 text-sm text-error" data-testid="agent-question-notice">
          {{ notice }}
        </p>
      </div>

      <!-- 送信ボタンは面の中で、スクロールする領域の外。文言だけが画面ごとに変わる
           （design 決定3）。`self-start` はボタンが横いっぱいに伸びるのを止める
           （flex item の既定は stretch） -->
      <UButton class="mt-4 self-start" data-testid="agent-question-submit" @click="send">
        {{ props.submitLabel }}
      </UButton>
    </template>

    <p v-else class="py-8 text-center text-sm text-muted" data-testid="agent-question-empty">
      今は答える問いがありません。
    </p>
  </div>
</template>
