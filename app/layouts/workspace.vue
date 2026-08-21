<script setup lang="ts">
/**
 * 下層（プロジェクト単位）のシェル。
 *
 * ナビゲーションは画面左の縦並び。上層はヘッダー直下の横並びタブなので、形を見た時点で
 * どちらの階層にいるかが分かる（specs/project-workspace）。
 *
 * プロジェクト切替の口はここに置かない。別のプロジェクトへ移るときは上層を経由する。
 */
import { computed, useFetch, useRoute } from '#imports';

import { useBoardSocket } from '~/composables/useBoardSocket';

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { upstreamConnected } = useBoardSocket();

const { data: info, error } = await useFetch(() => `/api/projects/${projectId.value}/info`);

/**
 * 本家が停止すると registry から消えて解決できなくなる（specs/project-workspace）。
 *
 * Nuxt の `error` は `Ref<ErrorT | undefined>` で、エラーが無いときは `undefined` になる。
 * `!== null` で判定すると常に真になるので真偽値で見る。
 */
const unresolved = computed(() => Boolean(error.value));

const sections = [
  { to: 'specs', label: '仕様書' },
  { to: 'steering', label: 'ステアリング' },
  { to: 'tasks', label: 'タスク' },
  { to: 'approvals', label: '承認' },
] as const;
</script>

<template>
  <div class="min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)]">
    <header class="sb-bar">
      <NuxtLink
        to="/"
        class="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        data-testid="back-to-portal"
      >
        ← ポータルへ戻る
      </NuxtLink>
      <span class="text-base font-semibold" data-testid="workspace-project-name">
        {{ info?.projectName ?? projectId }}
      </span>
      <span
        class="sb-chip"
        data-testid="workspace-connection"
        :data-connected="upstreamConnected && !unresolved"
      >
        {{ unresolved || !upstreamConnected ? '未接続' : 'アクティブ' }}
      </span>
    </header>

    <div class="flex">
      <nav
        class="w-44 shrink-0 border-r border-[var(--border-default)] bg-[var(--surface-panel)] p-2"
        aria-label="プロジェクト"
        data-testid="workspace-sidebar"
      >
        <ul class="space-y-0.5">
          <li v-for="section in sections" :key="section.to">
            <NuxtLink
              :to="`/projects/${projectId}/${section.to}`"
              class="sb-navitem"
              active-class="sb-navitem-on"
              :data-testid="`sidebar-${section.to}`"
            >
              {{ section.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <main class="min-w-0 flex-1 p-4">
        <p v-if="unresolved" class="sb-placeholder" data-testid="workspace-unresolved">
          このプロジェクトは本家に繋がっていません。ポータルから選び直してください。
        </p>
        <slot v-else />
      </main>
    </div>
  </div>
</template>
