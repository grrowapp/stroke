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

import SbIcon from '~/components/shared/SbIcon.vue';
import EmptyState from '~/components/workspace/EmptyState.vue';
import { useBoardSocket } from '~/composables/shared/useBoardSocket';

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
  { to: '', label: '概要' },
  { to: 'specs', label: '仕様書' },
  { to: 'steering', label: 'ステアリング' },
  { to: 'tasks', label: 'タスク' },
  { to: 'approvals', label: '承認' },
] as const;

/** 概要だけは完全一致でないと、下層のどこにいても選択中に見えてしまう */
function linkOf(to: string): string {
  return to === '' ? `/projects/${projectId.value}` : `/projects/${projectId.value}/${to}`;
}
</script>

<template>
  <!--
    prototype 案A の `.frame` と同じ組み方。縦に header と body を積み、body が残りを
    すべて取る（`.body { flex:1 }`）。ここを詰めないとサイドバーが中身の高さで切れて、
    画面の途中で終わってしまう。本家のサイドバーも `lg:h-screen` で全高。
  -->
  <div class="flex min-h-screen flex-col bg-[var(--surface-base)] text-[var(--text-primary)]">
    <header class="sb-bar">
      <NuxtLink to="/" class="sb-navitem sb-bar-back pl-0" data-testid="back-to-portal">
        <SbIcon name="back" :size="16" />
        ポータルへ戻る
      </NuxtLink>

      <span class="sb-bar-title inline-flex items-center gap-1.5" data-testid="workspace-project-name">
        <SbIcon name="folder" :size="14" />
        {{ info?.projectName ?? projectId }}
      </span>

      <span class="sb-chip" :class="connected ? 'sb-chip-on' : ''">
        {{ connected ? 'アクティブ' : '未接続' }}
      </span>

      <span
        class="ml-auto inline-block size-2 rounded-full"
        :style="{ background: connected ? 'var(--status-success)' : 'var(--text-faint)' }"
        :title="connected ? '本家に接続済み' : '本家に未接続'"
        data-testid="workspace-connection"
        :data-connected="connected"
      />
    </header>

    <div class="flex min-h-0 flex-1">
      <nav class="sb-sidebar" aria-label="プロジェクト" data-testid="workspace-sidebar">
        <ul>
          <li v-for="section in sections" :key="section.to">
            <NuxtLink
              :to="linkOf(section.to)"
              class="sb-navitem"
              :active-class="section.to === '' ? '' : 'sb-navitem-on'"
              exact-active-class="sb-navitem-on"
              :data-testid="`sidebar-${section.to || 'overview'}`"
            >
              {{ section.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <!-- 本家の本文余白は px-6 py-6（App.tsx の main）。サイドバーは prototype の 170px -->
      <main class="min-w-0 flex-1 overflow-auto px-6 py-6">
        <div v-if="unresolved" class="sb-panel">
          <EmptyState testid="workspace-unresolved" title="未接続" icon="check-circle">
            このプロジェクトは本家に繋がっていません。ポータルから選び直してください。
          </EmptyState>
        </div>
        <slot v-else />
      </main>
    </div>
  </div>
</template>
