<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant A「モーダルの中に帯」
 *
 * 構造: 承認モーダルは開いたまま。名前の入力の下に「AI が応答中」の帯が出る。主役の操作は
 * 同じ「作る」ボタンで、ユーザーが応答の終わりを見て**自分でもう一度押す**。
 *
 * 狙い: 何も動かさない。今の衝突の帯（「既にあります」）と同じ場所・同じ器で、理由だけ違う。
 * 疑い: 応答がいつ終わるかを帯の文言で追う形になる。待つ間モーダルを占有し続ける。
 *
 * 通信は一切しない。「作る」は 409 busy の擬似応答を返し、AI の実行は 6 秒のタイマーで真似る。
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>();
const r = props.review;

type State = 'idle' | 'busy-rejected' | 'run-ended' | 'created';
const state = ref<State>('idle');
const FAKE_RUN_MS = 6_000;
let timer: ReturnType<typeof setTimeout> | null = null;

function fakeApprove(): void {
  if (state.value === 'idle') {
    // 1回目: サーバが 409 busy を返した体
    state.value = 'busy-rejected';
    timer = setTimeout(() => {
      state.value = 'run-ended';
    }, FAKE_RUN_MS);
    return;
  }
  if (state.value === 'run-ended') {
    // 2回目: 通った体
    state.value = 'created';
    setTimeout(() => {
      r.approveOpen.value = false;
      state.value = 'idle';
    }, 900);
  }
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <UModal v-model:open="r.approveOpen.value" title="承認してプロジェクトを作る">
    <template #body>
      <p class="mb-3 text-sm text-muted">承認すると元に戻せません。プロジェクト名を確認してください。</p>
      <UInput v-model="r.projectName.value" class="w-full" :disabled="state === 'busy-rejected'" />

      <!-- ここが変わる部分。衝突の帯と同じ位置に、理由の違う帯が出る -->
      <div
        v-if="state === 'busy-rejected'"
        class="mt-3 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm"
        role="status"
        aria-live="polite"
      >
        <span class="pt-spin mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p class="font-medium">AI が応答中です</p>
          <p class="mt-0.5 text-muted">
            応答が終わるまで待ってから、もう一度「作る」を押してください。名前「{{ r.projectName.value }}」はこのまま通ります。
          </p>
        </div>
      </div>

      <div
        v-else-if="state === 'run-ended'"
        class="mt-3 rounded-md border border-success/40 bg-success/10 px-3 py-2.5 text-sm"
        role="status"
        aria-live="polite"
      >
        <p class="font-medium">AI の応答が終わりました</p>
        <p class="mt-0.5 text-muted">「作る」を押すと、この名前で作れます。</p>
      </div>

      <p v-else-if="state === 'created'" class="mt-3 text-sm text-success">作りました（stub）</p>

      <p v-if="r.comments.value.length" class="mt-4 text-sm text-warning">
        コメントが {{ r.comments.value.length }} 件残っています。承認するとこのコメントは渡らずに確定します。
      </p>

      <p class="mt-4 font-mono text-[11px] text-dimmed">state: {{ state }}</p>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="r.approveOpen.value = false">やめる</UButton>
      <UButton :disabled="state === 'busy-rejected' || state === 'created'" @click="fakeApprove">
        作る
      </UButton>
    </template>
  </UModal>
</template>

<style scoped>
.pt-spin {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: pt-rot 0.8s linear infinite;
}
@keyframes pt-rot {
  to {
    transform: rotate(360deg);
  }
}
</style>
