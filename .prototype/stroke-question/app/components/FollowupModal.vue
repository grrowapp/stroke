<script setup lang="ts">
// 差し戻し後に AI が返してきた問い。画面1 と同じ1問1答をモーダルの中で繰り返す。
// 何問来るかは事前に分からない。答えるたびに次が来ることがあり、AI が打ち止めたら終わる。
import { followupQuestions } from '~/data/followup'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ done: [answers: { question: string; answer: string }[]] }>()

const index = ref(0)
const asked = ref<{ question: string; answer: string }[]>([])
const free = ref('')
const picked = ref('')
const waiting = ref(false)

const q = computed(() => followupQuestions[index.value] ?? null)

watch(open, (v) => {
  if (!v) return
  index.value = 0
  asked.value = []
  free.value = ''
  picked.value = ''
  waiting.value = false
})

function pick(label: string) {
  picked.value = label
  free.value = ''
}

function writeFree(v: string) {
  free.value = v
  picked.value = v
}

// 答えを返す。次の問いが来れば続き、来なければ終わる。
async function answer() {
  if (!picked.value || !q.value) return
  asked.value.push({ question: q.value.question, answer: picked.value })
  picked.value = ''
  free.value = ''
  waiting.value = true

  // 実物では claude -p の応答待ち。ここでは待ち時間だけ模す。
  await new Promise((r) => setTimeout(r, 700))
  waiting.value = false
  index.value += 1

  if (!followupQuestions[index.value]) {
    emit('done', asked.value)
    open.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :dismissible="false" title="AI からの質問" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="waiting" class="py-16 text-center text-sm text-muted">
        AI が次を考えています…
      </div>

      <div v-else-if="q">
        <!-- 何問目か。総数は出さない（事前に分からない） -->
        <div class="mb-4 flex items-center justify-between">
          <span class="text-xs tabular-nums text-muted">質問 {{ index + 1 }}</span>
          <span v-if="asked.length" class="text-xs text-muted">
            ここまで {{ asked.length }} 問に回答
          </span>
        </div>

        <h3 class="mb-4 text-lg font-semibold leading-snug">{{ q.question }}</h3>

        <div class="mb-5 rounded-lg border border-default bg-elevated/50 p-3">
          <p class="mb-1 text-xs font-medium text-muted">背景</p>
          <p class="text-sm leading-relaxed text-toned">{{ q.background }}</p>
        </div>

        <div class="space-y-2">
          <button
            v-for="o in q.options"
            :key="o.label"
            type="button"
            class="w-full rounded-lg border p-3 text-left transition"
            :class="picked === o.label && !free
              ? 'border-primary bg-primary/5'
              : 'border-default hover:border-inverted/30'"
            @click="pick(o.label)"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ o.label }}</span>
              <UBadge v-if="o.recommended" size="sm" variant="subtle">推奨</UBadge>
            </div>
            <p class="mt-1 text-sm leading-relaxed text-toned">{{ o.detail }}</p>
            <p v-if="o.rationale" class="mt-2 border-l-2 border-primary/40 pl-3 text-sm text-muted">
              {{ o.rationale }}
            </p>
          </button>
        </div>

        <div class="mt-4">
          <p class="mb-1 text-sm font-medium">どれでもない場合</p>
          <UTextarea
            :model-value="free"
            :rows="2"
            class="w-full"
            placeholder="自分の言葉で書く"
            @update:model-value="writeFree($event as string)"
          />
        </div>
      </div>
    </template>

    <template #footer>
      <span class="text-xs text-muted">答えると、AI がさらに聞いてくることがあります</span>
      <div class="flex-1" />
      <UButton :disabled="!picked || waiting" @click="answer">答える</UButton>
    </template>
  </UModal>
</template>
