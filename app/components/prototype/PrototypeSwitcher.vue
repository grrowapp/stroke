<script setup lang="ts">
/**
 * PROTOTYPE — throwaway. 案を切り替える浮きバー。
 * 評価対象の意匠と混ざらないよう、わざと本体から外した見た目にしている。dev だけに出る。
 */
import { computed, onMounted, onUnmounted, useRouter } from '#imports';

import {
  PROTOTYPE_VARIANT_NAMES,
  PROTOTYPE_VARIANTS,
  usePrototypePanels,
  type PrototypeVariant,
} from '~/composables/usePrototypePanels';

const router = useRouter();
const { variant, leftCollapsed, rightTucked } = usePrototypePanels();

const shown = import.meta.dev;
const index = computed(() => PROTOTYPE_VARIANTS.indexOf(variant.value));

function go(step: number): void {
  const size = PROTOTYPE_VARIANTS.length;
  const next = PROTOTYPE_VARIANTS[(index.value + step + size) % size] as PrototypeVariant;
  void router.replace({ query: { variant: next } });
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || target?.isContentEditable === true) return;
  if (event.key === 'ArrowLeft') go(-1);
  if (event.key === 'ArrowRight') go(1);
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div
    v-if="shown"
    class="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-fuchsia-500 bg-black/90 px-2 py-1 font-mono text-xs text-white shadow-lg"
    data-testid="prototype-switcher"
  >
    <button type="button" class="px-2 py-1 hover:text-fuchsia-300" aria-label="前の案" @click="go(-1)">
      ←
    </button>
    <span class="whitespace-nowrap px-2">
      {{ variant }} — {{ PROTOTYPE_VARIANT_NAMES[variant] }}
      <span class="text-fuchsia-300">
        [左 {{ leftCollapsed ? '閉' : 'フル' }} / 右 {{ rightTucked ? '引込' : '出' }}]
      </span>
    </span>
    <button type="button" class="px-2 py-1 hover:text-fuchsia-300" aria-label="次の案" @click="go(1)">
      →
    </button>
  </div>
</template>
