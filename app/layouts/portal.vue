<script setup lang="ts">
/**
 * 上層（プロジェクト横断ポータル）のシェル。
 *
 * ナビゲーションはヘッダー直下の横並びタブ。下層は左サイドバーで、形そのものを変えることで
 * どちらの階層にいるかが見て分かる（specs/project-workspace）。
 *
 * 見た目は prototype（archive の navigation.prototype.html）の案A に合わせる。
 */
import { useBoardSocket } from '~/composables/useBoardSocket';

const { notifications, upstreamConnected } = useBoardSocket();
</script>

<template>
  <div class="min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)]">
    <header class="sb-bar">
      <span class="text-base font-semibold">stroke-board</span>
      <span
        class="ml-auto flex items-center gap-2 text-[13px] text-[var(--text-muted)]"
        data-testid="upstream-connection"
        :data-connected="upstreamConnected"
      >
        <span
          class="inline-block size-2 rounded-full"
          :style="{
            background: upstreamConnected ? 'var(--interactive-primary)' : 'var(--text-faint)',
          }"
        />
        {{ upstreamConnected ? '接続済み' : '未接続' }}
      </span>
    </header>

    <nav
      class="flex gap-1 border-b border-[var(--border-default)] bg-[var(--surface-panel)] px-3"
      aria-label="ポータル"
    >
      <NuxtLink to="/" class="sb-tab" active-class="sb-tab-on" data-testid="tab-notifications">
        通知
        <span v-if="notifications.length > 0" class="sb-badge ml-1">{{ notifications.length }}</span>
      </NuxtLink>
      <NuxtLink to="/projects" class="sb-tab" active-class="sb-tab-on" data-testid="tab-projects">
        プロジェクト一覧
      </NuxtLink>
    </nav>

    <main class="p-4">
      <slot />
    </main>
  </div>
</template>
