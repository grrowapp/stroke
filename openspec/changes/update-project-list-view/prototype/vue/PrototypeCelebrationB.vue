<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — variant B「一覧の頭に差し込む帯」
 *
 * 構造: 浮かせない。**一覧そのものの上端に行を1本押し込む**。テーブルが下へずれて場所を空け、
 * 引くときは畳まれて閉じる。confetti は帯の位置から真上へ1発だけ、控えめに。
 *
 * 狙い: 一覧の文脈に密着する。「この一覧に何かが起きた」ことが位置で分かる。
 * 疑い: レイアウトが動く。読んでいる最中に一覧がずれるのは邪魔かもしれない。
 */
import { onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{ name: string | null }>();
const emit = defineEmits<{ done: [] }>();

const HOLD_MS = 3_600;
const FADE_MS = 380;

const leaving = ref(false);
const root = ref<HTMLElement | null>(null);
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
      const box = root.value?.getBoundingClientRect();
      confetti({
        particleCount: 55,
        spread: 96,
        startVelocity: 26,
        ticks: 110,
        gravity: 0.9,
        origin: {
          x: 0.5,
          y: box === undefined ? 0.28 : (box.top + box.height) / window.innerHeight,
        },
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
    ref="root"
    class="b-strip"
    :class="{ 'b-leaving': leaving }"
    role="status"
    aria-live="polite"
    data-testid="project-created"
  >
    <span class="b-mark">🎉</span>
    <span class="b-text">
      プロジェクト <strong>{{ name }}</strong> の作成が完了しました！
    </span>
  </div>
</template>

<style scoped>
.b-strip {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  margin-bottom: 8px;
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--status-success) 45%, transparent);
  background: color-mix(in srgb, var(--status-success) 10%, var(--surface-panel));
  /* 押し込みで開く。高さと余白を同時に畳めるように max-height を使う */
  max-height: 80px;
  transition:
    max-height 380ms ease,
    opacity 380ms ease,
    margin 380ms ease,
    padding 380ms ease;
}

.b-leaving {
  max-height: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}

.b-mark {
  font-size: 20px;
  line-height: 1;
}

.b-text {
  font-size: 15px;
  color: var(--text-primary);
}

.b-text strong {
  color: var(--status-success);
}

@media (prefers-reduced-motion: reduce) {
  .b-strip {
    transition: none;
  }
}
</style>
