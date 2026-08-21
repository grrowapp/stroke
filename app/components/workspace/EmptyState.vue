<script setup lang="ts">
/**
 * 中身が無いことを示す。
 *
 * 形は本家の Empty State（`SteeringPage.tsx` / `SpecsPage.tsx`）に合わせる。中央寄せの
 * `py-12` に 48px のアイコン、見出し、説明の順。無彩色にするのは `ui.md` の Visual
 * Language のとおり（本家の `Not Created` / `No tasks` 相当）。
 *
 * 破線の枠は使わない。あれは prototype が「下層の中身はこの問いの対象外」を示すために
 * 置いていたダミー枠で、本家には無い。
 */
import UpstreamIcon from '~/components/shared/UpstreamIcon.vue';

withDefaults(
  defineProps<{ testid?: string; title?: string; icon?: 'document' | 'tasks' | 'check-circle' }>(),
  { icon: 'document' },
);
</script>

<template>
  <div class="sb-empty" :data-testid="testid">
    <UpstreamIcon :name="icon" />
    <p v-if="title" class="sb-empty-title">{{ title }}</p>
    <p class="sb-empty-description">
      <slot />
    </p>
  </div>
</template>
