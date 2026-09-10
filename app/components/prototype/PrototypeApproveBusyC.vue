<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant C「モーダルが待ち状態に変わり、自動でやり直す」
 *
 * 構造: busy で断られたらモーダルの中身が丸ごと「待っています」の面に**入れ替わる**。
 * 名前の入力も「作る」も消え、大きな待機表示と「終わり次第この名前で作ります」だけになる。
 * 応答が終わると**ユーザーが押さなくても**昇格をやり直し、成功したら閉じて一覧へ（stub）。
 * 逃げ道は「待つのをやめる」だけで、押すと元の入力面に戻る。
 *
 * 狙い: ユーザーは判断を終えている（名前を確定して「作る」を押した）。その後の待ちと再送は
 *       系の仕事で、もう一度押させる理由が無い。
 * 疑い: specs/stroke/frontier は「ユーザーが承認し直す」と書いている。系が承認し直す形は
 *       規定の読み替えになる。自動でやり直す間に AI が問い返しを出したらどうするか。
 *
 * 通信は一切しない。「作る」は 409 busy の擬似応答を返し、AI の実行は 6 秒のタイマーで真似る。
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ review: ReturnType<typeof useProposalReview> }>();
const r = props.review;

type State = 'idle' | 'waiting' | 'retrying' | 'created';
const state = ref<State>('idle');
const FAKE_RUN_MS = 6_000;
const FAKE_PROMOTE_MS = 1_200;
let timer: ReturnType<typeof setTimeout> | null = null;

function fakeApprove(): void {
  state.value = 'waiting';
  timer = setTimeout(() => {
    // 応答が終わった → 系が自分でやり直す
    state.value = 'retrying';
    timer = setTimeout(() => {
      state.value = 'created';
      timer = setTimeout(() => {
        r.approveOpen.value = false;
        state.value = 'idle';
      }, 900);
    }, FAKE_PROMOTE_MS);
  }, FAKE_RUN_MS);
}

function stopWaiting(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  state.value = 'idle';
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <UModal
    v-model:open="r.approveOpen.value"
    :title="state === 'idle' ? '承認してプロジェクトを作る' : 'AI の応答を待っています'"
    :dismissible="state === 'idle'"
  >
    <template #body>
      <!-- 入力面 -->
      <template v-if="state === 'idle'">
        <p class="mb-3 text-sm text-muted">承認すると元に戻せません。プロジェクト名を確認してください。</p>
        <UInput v-model="r.projectName.value" class="w-full" />
        <p v-if="r.comments.value.length" class="mt-4 text-sm text-warning">
          コメントが {{ r.comments.value.length }} 件残っています。承認するとこのコメントは渡らずに確定します。
        </p>
      </template>

      <!-- 待ち面。入力も「作る」も消える -->
      <div v-else class="c-wait" role="status" aria-live="polite">
        <span class="pt-spin-lg" aria-hidden="true" />
        <p v-if="state === 'waiting'" class="c-title">AI がまだ応答中です</p>
        <p v-else-if="state === 'retrying'" class="c-title">応答が終わりました。作っています…</p>
        <p v-else class="c-title text-success">作りました（stub）</p>
        <p class="c-note">
          終わり次第、<strong>「{{ r.projectName.value }}」</strong>で自動的に作ります。<br>
          このまま待つか、本文を読み返していてください。
        </p>
      </div>

      <p class="mt-4 font-mono text-[11px] text-dimmed">state: {{ state }}</p>
    </template>
    <template #footer>
      <template v-if="state === 'idle'">
        <UButton color="neutral" variant="ghost" @click="r.approveOpen.value = false">やめる</UButton>
        <UButton @click="fakeApprove">作る</UButton>
      </template>
      <template v-else>
        <UButton color="neutral" variant="ghost" :disabled="state !== 'waiting'" @click="stopWaiting">
          待つのをやめる
        </UButton>
      </template>
    </template>
  </UModal>
</template>

<style scoped>
.c-wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 8px 8px;
  text-align: center;
}
.c-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.c-note {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted, #666);
  line-height: 1.6;
}
.pt-spin-lg {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 3px solid currentColor;
  border-right-color: transparent;
  opacity: 0.7;
  animation: pt-rot 0.9s linear infinite;
}
@keyframes pt-rot {
  to {
    transform: rotate(360deg);
  }
}
</style>
