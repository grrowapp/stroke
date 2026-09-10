<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant B「モーダルを閉じて、画面2 の上に帯」
 *
 * 構造: busy で断られたらモーダルを**閉じる**。画面2 の上部（固定バーの直下）に「承認は AI の
 * 応答後に」の帯が居座り、名前を保持していることを示す。応答が終わると帯の文言が変わり、
 * 「承認に戻る」ボタンが現れる。押すと同じ名前でモーダルが開き直る。
 *
 * 狙い: 待つ間、本文とコメントを読み返せる（モーダルが邪魔しない）。待ちの状態が画面2 の
 *       状態として見える。
 * 疑い: 一度閉じるので「断られた」と読まれるかもしれない。モーダルを開き直す一手が増える。
 *
 * 通信は一切しない。「作る」は 409 busy の擬似応答を返し、AI の実行は 6 秒のタイマーで真似る。
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>();
const r = props.review;

type State = 'idle' | 'deferred' | 'run-ended' | 'created';
const state = ref<State>('idle');
const heldName = ref('');
const FAKE_RUN_MS = 6_000;
let timer: ReturnType<typeof setTimeout> | null = null;

function fakeApprove(): void {
  if (state.value === 'idle') {
    heldName.value = r.projectName.value;
    state.value = 'deferred';
    r.approveOpen.value = false;
    timer = setTimeout(() => {
      state.value = 'run-ended';
    }, FAKE_RUN_MS);
    return;
  }
  if (state.value === 'run-ended') {
    state.value = 'created';
    setTimeout(() => {
      r.approveOpen.value = false;
      state.value = 'idle';
    }, 900);
  }
}

function backToApprove(): void {
  r.projectName.value = heldName.value;
  r.approveOpen.value = true;
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div>
    <!-- 画面2 の上部に居座る帯。固定バー（--sb-stroke-bar-h）の直下 -->
    <div
      v-if="state === 'deferred' || state === 'run-ended'"
      class="b-band"
      :class="state === 'run-ended' ? 'b-band-ready' : ''"
      role="status"
      aria-live="polite"
    >
      <span v-if="state === 'deferred'" class="pt-spin shrink-0" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <template v-if="state === 'deferred'">
          <p class="font-medium">承認は AI の応答が終わってから</p>
          <p class="text-muted">プロジェクト名「{{ heldName }}」は保持しています。応答が終わったらここでお知らせします。</p>
        </template>
        <template v-else>
          <p class="font-medium">AI の応答が終わりました</p>
          <p class="text-muted">「{{ heldName }}」でそのまま承認できます。</p>
        </template>
      </div>
      <UButton v-if="state === 'run-ended'" size="sm" @click="backToApprove">承認に戻る</UButton>
      <span class="font-mono text-[11px] text-dimmed">state: {{ state }}</span>
    </div>

    <UModal v-model:open="r.approveOpen.value" title="承認してプロジェクトを作る">
      <template #body>
        <p class="mb-3 text-sm text-muted">承認すると元に戻せません。プロジェクト名を確認してください。</p>
        <UInput v-model="r.projectName.value" class="w-full" />

        <p v-if="state === 'run-ended'" class="mt-3 text-sm text-success">
          AI の応答は終わっています。この名前で作れます。
        </p>
        <p v-else-if="state === 'created'" class="mt-3 text-sm text-success">作りました（stub）</p>

        <p v-if="r.comments.value.length" class="mt-4 text-sm text-warning">
          コメントが {{ r.comments.value.length }} 件残っています。承認するとこのコメントは渡らずに確定します。
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="r.approveOpen.value = false">やめる</UButton>
        <UButton :disabled="state === 'created'" @click="fakeApprove">作る</UButton>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.b-band {
  position: sticky;
  top: var(--sb-stroke-bar-h, 56px);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 24px;
  font-size: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--status-warning, #d97706) 45%, var(--border-default, #ddd));
  background: color-mix(in srgb, var(--status-warning, #d97706) 12%, var(--surface-panel, #fff));
}
.b-band-ready {
  border-bottom-color: color-mix(in srgb, var(--status-success, #16a34a) 45%, var(--border-default, #ddd));
  background: color-mix(in srgb, var(--status-success, #16a34a) 12%, var(--surface-panel, #fff));
}
.pt-spin {
  width: 16px;
  height: 16px;
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
