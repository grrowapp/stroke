<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant A「中央に浮く帯」
 *
 * 構造: 画面中央上部に固定した独立の面。一覧とは切り離して浮かせる。confetti は面の位置から
 * 左右2発。今の実装（`ProjectCreationCelebration`）がこれ。
 *
 * 狙い: いちばん強く出る。見落としようがない。
 * 疑い: 一覧の文脈から切れているので、どのプロジェクトの話かは文言でしか分からない。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ name: string | null }>();
const emit = defineEmits<{ done: [] }>();

const HOLD_MS = 3_200;
const FADE_MS = 420;

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
      for (const x of [0.38, 0.62]) {
        confetti({
          particleCount: 70,
          spread: 62,
          startVelocity: 34,
          ticks: 140,
          origin: { x, y: 0.24 },
          disableForReducedMotion: true,
        });
      }
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
    class="a-panel"
    :class="{ 'a-leaving': leaving }"
    role="status"
    aria-live="polite"
    data-testid="project-created"
  >
    <p class="a-title">プロジェクト {{ name }} の作成が完了しました！</p>
    <p class="a-note">下の一覧から入れます。</p>
  </div>
</template>

<style scoped>
@keyframes a-in {
  from {
    opacity: 0;
    transform: translate(-50%, 14px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}

.a-panel {
  position: fixed;
  left: 50%;
  top: 22%;
  z-index: 40;
  transform: translateX(-50%);
  pointer-events: none;
  max-width: min(30rem, calc(100vw - 2rem));
  padding: 18px 28px;
  text-align: center;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--status-success) 40%, var(--border-default));
  background: var(--surface-panel);
  box-shadow: 0 18px 44px -18px rgb(0 0 0 / 0.45);
  animation: a-in 260ms ease-out both;
  transition: opacity 420ms ease, transform 420ms ease;
}

.a-leaving {
  opacity: 0;
  transform: translate(-50%, -10px);
}

.a-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--status-success);
}

.a-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .a-panel {
    animation: none;
    transition: none;
  }
}
</style>
