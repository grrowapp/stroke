<script setup lang="ts">
/**
 * 中身が無いことを示す。
 *
 * 形は本家の Empty State（`SteeringPage.tsx` / `SpecsPage.tsx`）に合わせる。中央寄せの
 * `py-12` に 48px のアイコン、見出し、説明の順。無彩色にするのは `ui.md` の Visual
 * Language のとおり（本家の `Not Created` / `No tasks` 相当）。
 *
 * 中身は @nuxt/ui の `UEmpty`。寸法は `:ui` の**置換関数**（`SlotClassReplacer`。既定の
 * クラス列を受け取って差し替える）で本家の値に置く。既定の `p-4 sm:p-6 lg:p-8` や
 * `max-w-sm` を merge で上書きしようとすると breakpoint 付きのクラスが残るため、
 * 置換関数を使う。
 *
 * 破線の枠は使わない。あれは prototype が「下層の中身はこの問いの対象外」を示すために
 * 置いていたダミー枠で、本家には無い（`variant="naked"`）。
 */

withDefaults(
  defineProps<{ testid?: string; title?: string; icon?: 'document' | 'tasks' | 'check-circle' }>(),
  { icon: 'document' },
);
</script>

<template>
  <UEmpty
    :data-testid="testid"
    :title="title"
    variant="naked"
    :ui="{
      root: () => 'px-4 py-12 text-center',
      header: () => '',
      title: () => 'mb-2 text-lg font-medium text-highlighted',
      description: () => 'text-sm text-toned',
    }"
  >
    <template #leading>
      <UIcon :name="`upstream:${icon}`" class="mx-auto mb-4 size-12 text-muted" />
    </template>
    <template #description>
      <slot />
    </template>
  </UEmpty>
</template>
