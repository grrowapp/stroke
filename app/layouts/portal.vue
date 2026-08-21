<script setup lang="ts">
/**
 * 上層（プロジェクト横断ポータル）のシェル。
 *
 * ナビゲーションはヘッダー直下の横並びタブ。下層は左サイドバーで、形そのものを変えることで
 * どちらの階層にいるかが見て分かるようにする（specs/project-workspace）。
 */
import { useBoardSocket } from '~/composables/useBoardSocket';

const { notifications, upstreamConnected } = useBoardSocket();
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="flex items-center justify-between border-b border-default px-6 py-3">
      <span class="font-semibold text-highlighted">stroke-board</span>
      <span
        class="flex items-center gap-2 text-sm text-muted"
        data-testid="upstream-connection"
        :data-connected="upstreamConnected"
      >
        <span
          class="inline-block size-2 rounded-full"
          :class="upstreamConnected ? 'bg-primary' : 'bg-current opacity-40'"
        />
        {{ upstreamConnected ? '接続済み' : '未接続' }}
      </span>
    </header>

    <nav class="flex gap-1 border-b border-default px-6" aria-label="ポータル">
      <NuxtLink
        to="/"
        class="px-3 py-2 text-sm border-b-2 border-transparent hover:text-highlighted"
        active-class="border-primary text-highlighted"
        data-testid="tab-notifications"
      >
        通知
        <span v-if="notifications.length > 0" class="ml-1 text-muted">{{ notifications.length }}</span>
      </NuxtLink>
      <NuxtLink
        to="/projects"
        class="px-3 py-2 text-sm border-b-2 border-transparent hover:text-highlighted"
        active-class="border-primary text-highlighted"
        data-testid="tab-projects"
      >
        プロジェクト一覧
      </NuxtLink>
    </nav>

    <main class="px-6 py-5">
      <slot />
    </main>
  </div>
</template>
