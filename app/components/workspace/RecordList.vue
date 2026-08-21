<script setup lang="ts">
/**
 * 下層の一覧。各行はリンクで、URL で対象を指せるようにする。
 *
 * 本家のダッシュボードは `projectId` を localStorage に持ち URL に出さないため、
 * 「どのプロジェクトの何」を指すリンクが作れない。stroke-board がそれを繰り返さない
 * ように、一覧の各行は必ず固有の URL を持つ（product.md の Purpose）。
 */
export interface RecordItem {
  /** 一覧内で一意 */
  key: string;
  label: string;
  /** 行の下段に出す補足。無ければ出さない */
  detail?: string;
  /** 行の右に出すチップ。無ければ出さない */
  chip?: string;
  /** 遷移先。無ければ選べない行になる */
  to?: string;
}

defineProps<{ items: RecordItem[]; testid?: string }>();
</script>

<template>
  <ul class="space-y-1" :data-testid="testid">
    <li v-for="item in items" :key="item.key">
      <NuxtLink
        v-if="item.to"
        :to="item.to"
        class="sb-navitem w-full justify-between"
        active-class="sb-navitem-on"
        data-testid="record-row"
        :data-key="item.key"
      >
        <span class="min-w-0">
          <span class="block truncate">{{ item.label }}</span>
          <span v-if="item.detail" class="block truncate text-[11px] text-[var(--text-muted)]">
            {{ item.detail }}
          </span>
        </span>
        <span v-if="item.chip" class="sb-chip shrink-0">{{ item.chip }}</span>
      </NuxtLink>

      <span
        v-else
        class="sb-navitem w-full cursor-not-allowed justify-between opacity-45"
        data-testid="record-row"
        :data-key="item.key"
        :data-disabled="true"
      >
        <span class="min-w-0">
          <span class="block truncate">{{ item.label }}</span>
          <span v-if="item.detail" class="block truncate text-[11px] text-[var(--text-muted)]">
            {{ item.detail }}
          </span>
        </span>
        <span v-if="item.chip" class="sb-chip shrink-0">{{ item.chip }}</span>
      </span>
    </li>
  </ul>
</template>
