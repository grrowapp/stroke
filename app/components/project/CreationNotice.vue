<script setup lang="ts">
/**
 * 生成の決着を知らせる面（specs/project/generation「決着したら、知らせてから次を選ばせる」）。
 *
 * **選ばせるモーダルとは別物である。** ここは「何が起きたか」を伝えるだけで、次に何をするかは
 * この面が引いた後に出るモーダルが聞く。
 *
 * 満たすもの。
 *
 * - **画面の半分くらいを埋める。** 小さすぎず、画面全体も覆わない
 * - **フェードアウトで自ら消える。** 消えないと操作ができない
 * - **一覧の行の中に収めない。画面遷移しない**
 * - **操作を要求しない。** 閉じるボタンを置かない——押させたら「操作」になる
 *
 * トーストには載せない。あちらは本家由来の通知のためのもので、1行のテキストに限る形が
 * 決まっている（specs/notification-toast）。
 *
 * confetti は `canvas-confetti` を動的 import で呼ぶ。ブラウザ専用なので SSR に載せない
 * （design.md D8）。成功のときだけ弾ける。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
  /** 知らせる対象のプロジェクト名。null の間は何も出ない */
  name: string | null;
  /** 決着の中身。成功なら祝い、失敗なら作りきれなかったこと */
  outcome: 'done' | 'failed';
}>();

const emit = defineEmits<{ done: [] }>();

/**
 * 出てから引くまで。
 *
 * 見落とす速さでも、次の操作を待たせる遅さでもない範囲。実物で決めた値は ui.md が持つ。
 */
const HOLD_MS = 2_600;
const FADE_MS = 420;

const leaving = ref(false);
const root = ref<HTMLElement | null>(null);

let holdTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (holdTimer !== null) clearTimeout(holdTimer);
  if (fadeTimer !== null) clearTimeout(fadeTimer);
  holdTimer = null;
  fadeTimer = null;
}

/** 動きを抑える設定。confetti は出さず、面と文言だけ残す */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 弾ける。面の位置から左右へ散らす。
 *
 * 読み込みに失敗しても文言は出ているので、握り潰して先へ進む。演出が出ないことより、
 * 例外で一覧が壊れることの方が悪い。
 */
async function burst(): Promise<void> {
  if (prefersReducedMotion()) return;

  try {
    const { default: confetti } = await import('canvas-confetti');
    const box = root.value?.getBoundingClientRect();
    const y = box === undefined ? 0.4 : (box.top + box.height / 2) / window.innerHeight;

    for (const x of [0.34, 0.66]) {
      confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 38,
        ticks: 160,
        origin: { x, y },
        disableForReducedMotion: true,
      });
    }
  } catch {
    // 出せなくても文言は出ている
  }
}

// **`name` と `outcome` の両方を見る。** `name` だけだと、親が両方を更新したときに古い
// `outcome` で走り、失敗なのに confetti が弾ける
watch(
  () => [props.name, props.outcome] as const,
  ([name, outcome]) => {
    clearTimers();
    if (name === null) return;

    leaving.value = false;
    if (outcome === 'done') void burst();

    holdTimer = setTimeout(() => {
      leaving.value = true;
      fadeTimer = setTimeout(() => emit('done'), FADE_MS);
    }, HOLD_MS);
  },
  { immediate: true },
);

onBeforeUnmount(clearTimers);
</script>

<template>
  <!--
    `aria-live="polite"` で読み上げには乗せるが、フォーカスは移さない。`pointer-events: none`
    にしてあるので、出ている間も下の一覧をそのまま操作できる。
  -->
  <div
    v-if="name !== null"
    ref="root"
    class="sb-notice"
    :class="{ 'sb-notice-leaving': leaving }"
    role="status"
    aria-live="polite"
    data-testid="project-creation-notice"
    :data-project="name"
    :data-outcome="outcome"
  >
    <p v-if="outcome === 'done'" class="sb-notice-title">
      プロジェクト {{ name }} の作成が完了しました！
    </p>
    <p v-else class="sb-notice-title">プロジェクト {{ name }} を作りきれませんでした。</p>
  </div>
</template>
