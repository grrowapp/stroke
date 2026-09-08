<script setup lang="ts">
/**
 * ⚠ PROTOTYPE — 使い捨て。main に残さない。
 *
 * variant を切り替える浮きバー。`?variant=` を書き換えるだけで、URL がそのまま共有できる。
 * 評価対象の画面と見た目で混ざらないよう、わざと高コントラストにしてある。
 */
import { computed, useRoute, useRouter } from '#imports';
import { onBeforeUnmount, onMounted } from 'vue';

const props = defineProps<{ variants: readonly { key: string; name: string }[] }>();

const route = useRoute();
const router = useRouter();

const current = computed(() => String(route.query.variant ?? props.variants[0]!.key));
const index = computed(() => Math.max(0, props.variants.findIndex((v) => v.key === current.value)));
const label = computed(() => {
  const found = props.variants[index.value]!;
  return `${found.key}（${found.name}）`;
});

function go(step: number): void {
  const next = props.variants[(index.value + step + props.variants.length) % props.variants.length]!;
  void router.replace({ query: { ...route.query, variant: next.key } });
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable]')) return;
  if (event.key === 'ArrowLeft') go(-1);
  if (event.key === 'ArrowRight') go(1);
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="pt-switcher" data-testid="prototype-switcher">
    <button type="button" aria-label="前の variant" @click="go(-1)">←</button>
    <span>{{ label }}</span>
    <button type="button" aria-label="次の variant" @click="go(1)">→</button>
    <slot />
  </div>
</template>

<style scoped>
.pt-switcher {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: #111;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 10px 30px -8px rgb(0 0 0 / 0.6);
}

.pt-switcher button {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #333;
  color: #fff;
  line-height: 1;
}

.pt-switcher button:hover {
  background: #555;
}
</style>
