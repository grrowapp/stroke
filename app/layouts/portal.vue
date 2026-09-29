<script setup lang="ts">
/**
 * 上層（プロジェクト横断ポータル）のシェル。
 *
 * prototype（archive の navigation.prototype.html）の案A をそのまま写している。
 * ヘッダーの bar、その下にタブの bar（padding:0 14px / gap:2px）、本体は padding:16px。
 * 下層は左サイドバーで、形そのものを変えることでどちらの階層にいるかが見て分かる。
 */
import { useBoardSocket } from '~/composables/useBoardSocket';

const { notifications, upstreamConnected } = useBoardSocket();
</script>

<template>
  <!-- prototype 案A の `.frame`。header / タブ行 / 本体を縦に積み、本体が残りを取る -->
  <div class="flex min-h-screen flex-col bg-[var(--surface-base)] text-[var(--text-primary)]">
    <header class="sb-bar">
      <span class="text-base font-semibold">stroke-board</span>
      <!-- 本家との接続状態。prototype の dot（8px の丸） -->
      <span
        class="ml-auto inline-block size-2 rounded-full"
        :style="{
          background: upstreamConnected ? 'var(--status-success)' : 'var(--text-faint)',
        }"
        :title="upstreamConnected ? '本家に接続済み' : '本家に未接続'"
        data-testid="upstream-connection"
        :data-connected="upstreamConnected"
      />
    </header>

    <nav class="sb-bar sb-tabbar" aria-label="ポータル">
      <NuxtLink to="/notifications" class="sb-tab" active-class="sb-tab-on" data-testid="tab-notifications">
        <span class="inline-flex items-center gap-1.5">
          <UIcon name="sb:bell" class="size-3.5 shrink-0" />
          通知
          <span v-if="notifications.length > 0" class="sb-badge">{{ notifications.length }}</span>
        </span>
      </NuxtLink>
      <NuxtLink
        to="/projects"
        class="sb-tab"
        active-class="sb-tab-on"
        data-testid="tab-projects"
      >
        <span class="inline-flex items-center gap-1.5">
          <UIcon name="sb:grid" class="size-3.5 shrink-0" />
          プロジェクト一覧
        </span>
      </NuxtLink>
    </nav>

    <main class="min-h-0 flex-1 overflow-auto p-4">
      <slot />
    </main>
  </div>
</template>
