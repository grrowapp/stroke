<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant C「画面上端のリボン ＋ 対象の行が光る」
 *
 * 構造: 文言は画面上端から降りてくる細いリボン。**同時に、完了した行そのものが一度だけ光る**
 * （`.pt-row-flash` を行に当てる。ここでは名前を親へ渡すだけ）。confetti は画面上端から降らせる。
 *
 * 狙い: 「終わったこと」と「どれが終わったのか」を2箇所で同時に示す。レイアウトは動かさない。
 * 疑い: 目が2箇所に散る。リボンが細いので、大きく祝った感じは薄い。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ name: string | null }>();
const emit = defineEmits<{ done: [] }>();

const HOLD_MS = 2_800;
const FADE_MS = 340;

const leaving = ref(false);
let timers: ReturnType<typeof setTimeout>[] = [];

function clear(): void {
  timers.forEach(clearTimeout);
  timers = [];
}

watch(
  () => props.name,
  async (name) => {
    clear();
    if (name === null) return;
    leaving.value = false;

    try {
      const { default: confetti } = await import('canvas-confetti');
      confetti({
        particleCount: 120,
        spread: 180,
        startVelocity: 18,
        ticks: 200,
        gravity: 0.7,
        scalar: 0.85,
        origin: { x: 0.5, y: -0.05 },
        disableForReducedMotion: true,
      });
    } catch {
      /* 出せなくても文言は出ている */
    }

    timers.push(
      setTimeout(() => {
        leaving.value = true;
        timers.push(setTimeout(() => emit('done'), FADE_MS));
      }, HOLD_MS),
    );
  },
  { immediate: true },
);

onBeforeUnmount(clear);
</script>

<template>
  <div
    v-if="name !== null"
    class="c-ribbon"
    :class="{ 'c-leaving': leaving }"
    role="status"
    aria-live="polite"
    data-testid="project-created"
  >
    プロジェクト <strong>{{ name }}</strong> の作成が完了しました！
  </div>
</template>

<style scoped>
@keyframes c-in {
  from {
    transform: translate(-50%, -100%);
  }
  to {
    transform: translate(-50%, 0);
  }
}

.c-ribbon {
  position: fixed;
  left: 50%;
  top: 0;
  z-index: 60;
  transform: translateX(-50%);
  pointer-events: none;
  padding: 9px 26px;
  border-radius: 0 0 12px 12px;
  background: var(--status-success);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  box-shadow: 0 8px 24px -10px rgb(0 0 0 / 0.5);
  animation: c-in 240ms ease-out both;
  transition: transform 340ms ease, opacity 340ms ease;
}

.c-ribbon strong {
  font-weight: 800;
}

.c-leaving {
  transform: translate(-50%, -100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .c-ribbon {
    animation: none;
    transition: none;
  }
}
</style>
