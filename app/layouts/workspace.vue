<script setup lang="ts">
/**
 * 下層（プロジェクト単位）のシェル。
 *
 * prototype の案A をそのまま写している。ヘッダーに「← ポータルへ戻る」、フォルダアイコン付き
 * のプロジェクト名、状態チップ、右端に接続 dot。サイドバーは幅 170px / padding 10px /
 * パネル面。
 *
 * プロジェクト切替の口はここに置かない。別のプロジェクトへ移るときは上層を経由する。
 */
import { computed, useFetch, useRoute } from '#imports';

import SbIcon from '~/components/ui/SbIcon.vue';
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
const connected = computed(() => upstreamConnected.value && !unresolved.value);

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
      <NuxtLink to="/" class="sb-navitem pl-0" data-testid="back-to-portal">
        <SbIcon name="back" :size="16" />
        ポータルへ戻る
      </NuxtLink>

      <span class="inline-flex items-center gap-1.5 font-semibold" data-testid="workspace-project-name">
        <SbIcon name="folder" :size="14" />
        {{ info?.projectName ?? projectId }}
      </span>

      <span class="sb-chip">{{ connected ? 'アクティブ' : '未接続' }}</span>

      <span
        class="ml-auto inline-block size-2 rounded-full"
        :style="{ background: connected ? 'var(--status-success)' : 'var(--text-faint)' }"
        :title="connected ? '本家に接続済み' : '本家に未接続'"
        data-testid="workspace-connection"
        :data-connected="connected"
      />
    </header>

    <div class="flex">
      <nav class="sb-sidebar" aria-label="プロジェクト" data-testid="workspace-sidebar">
        <ul>
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
