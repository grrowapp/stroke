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
  <div class="min-h-screen bg-default text-default">
    <header class="flex items-center gap-4 border-b border-default px-6 py-3">
      <NuxtLink
        to="/"
        class="text-sm text-muted hover:text-highlighted focus-visible:outline focus-visible:outline-2"
        data-testid="back-to-portal"
      >
        ← ポータルへ戻る
      </NuxtLink>
      <span class="font-semibold text-highlighted" data-testid="workspace-project-name">
        {{ info?.projectName ?? projectId }}
      </span>
      <span
        class="ml-auto text-sm text-muted"
        data-testid="workspace-connection"
        :data-connected="upstreamConnected && !unresolved"
      >
        {{ unresolved ? '未接続' : upstreamConnected ? 'アクティブ' : '未接続' }}
      </span>
    </header>

    <div class="flex">
      <nav
        class="w-44 shrink-0 border-r border-default p-3"
        aria-label="プロジェクト"
        data-testid="workspace-sidebar"
      >
        <ul class="space-y-1">
          <li v-for="section in sections" :key="section.to">
            <NuxtLink
              :to="`/projects/${projectId}/${section.to}`"
              class="block rounded px-2 py-1 text-sm hover:text-highlighted"
              active-class="bg-elevated text-highlighted"
              :data-testid="`sidebar-${section.to}`"
            >
              {{ section.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <main class="flex-1 px-6 py-5">
        <p v-if="unresolved" class="text-muted" data-testid="workspace-unresolved">
          このプロジェクトは本家に繋がっていません。ポータルから選び直してください。
        </p>
        <slot v-else />
      </main>
    </div>
  </div>
</template>
