<script setup lang="ts">
/**
 * 下層（プロジェクト単位）のシェル。
 *
 * prototype の案A をそのまま写している。ヘッダーに「← ポータルへ戻る」、フォルダアイコン付き
 * のプロジェクト名、状態チップ、右端に接続 dot。
 *
 * サイドバーだけは prototype ではなく本家の寸法を使う（理由は main.css の `.sb-sidebar`）。
 *
 * サイドバーは畳める。本家（PageNavigationSidebar）と同じで、畳んでも消えず 64px の帯に
 * なり、そこに残るボタンで開き直す。項目のアイコンは開いていても畳んでいても出したままで、
 * 畳んだときにラベルだけが落ちる（本家も同じ。畳んだ瞬間に別の部品に見えない）。
 *
 * プロジェクト切替の口はここに置かない。別のプロジェクトへ移るときは上層を経由する。
 */
import { computed, useFetch, useRoute } from '#imports';

import EmptyState from '~/components/workspace/EmptyState.vue';
import { useBoardSocket } from '~/composables/useBoardSocket';
// PROTOTYPE — throwaway
import { usePrototypePanels } from '~/composables/usePrototypePanels';

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

/**
 * アイコンは常に出す。本家（PageNavigationSidebar）の nav 項目に付いている絵をそのまま
 * 割り当てている（概要＝nav.statistics、Feature＝nav.specs の文書、承認＝nav.approvals）。
 */
const sections = [
  { to: '', label: '概要', icon: 'upstream:statistics' },
  { to: 'specs', label: 'Feature', icon: 'upstream:document' },
  { to: 'steering', label: 'ステアリング', icon: 'upstream:steering' },
  { to: 'tasks', label: 'タスク', icon: 'upstream:tasks' },
  { to: 'approvals', label: '承認', icon: 'upstream:check-circle' },
] as const;

/** 概要だけは完全一致でないと、下層のどこにいても選択中に見えてしまう */
function linkOf(to: string): string {
  return to === '' ? `/projects/${projectId.value}` : `/projects/${projectId.value}/${to}`;
}

/**
 * サイドバーを畳んだかどうか。
 *
 * 本家は localStorage（`App.tsx` の `SIDEBAR_COLLAPSE_KEY`）に持つが、本家は CSR だけで
 * 動くので初回描画の前に読める。stroke-board は SSR があり、localStorage はサーバでは
 * 読めない。そこで持つと、サーバは必ず「開いた形」を返し、ブラウザに渡ってから畳むため、
 * 畳んだまま読み込み直すたびに 200ms かけて閉じるちらつきが出る。
 *
 * 見た目と挙動を本家に合わせるのが最優先なので、保存先だけをサーバでも読める cookie に
 * 替える。キーの名前と値（真偽値）は本家のまま。
 *
 * PROTOTYPE — throwaway。cookie の読み書きは `usePrototypePanels` へ寄せた。
 * 左の開閉は右の指摘の一覧と連動しない（左を閉じても右は出たまま）。
 */
const { leftCollapsed: collapsed, toggleLeft: toggleCollapsed } = usePrototypePanels();
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
        <UIcon name="sb:back" class="size-4 shrink-0" />
        ポータルへ戻る
      </NuxtLink>

      <span class="sb-bar-title inline-flex items-center gap-1.5" data-testid="workspace-project-name">
        <UIcon name="sb:folder" class="size-3.5 shrink-0" />
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
      <!--
        畳むボタンはサイドバーの中の一番上。本家もここに置き、畳んだ帯にも残るので
        開き直す口が同じ場所になる（PageNavigationSidebar のヘッダー行）。
      -->
      <nav
        class="sb-sidebar"
        :class="collapsed ? 'sb-sidebar-collapsed' : ''"
        aria-label="プロジェクト"
        data-testid="workspace-sidebar"
        :data-collapsed="collapsed"
      >
        <div class="sb-sidebar-head">
          <!--
            開いているときは見出しが入る。本家はここに製品名を置くが、下層のヘッダーが既に
            プロジェクト名を出しているので、このナビが何の並びかを示す語（＝この nav の
            aria-label と同じ）を使う
          -->
          <h2 v-if="!collapsed" class="sb-sidebar-title">プロジェクト</h2>

          <button
            type="button"
            class="sb-sidebar-toggle"
            :aria-label="collapsed ? 'サイドバーを開く' : 'サイドバーを畳む'"
            :title="collapsed ? 'サイドバーを開く' : 'サイドバーを畳む'"
            data-testid="sidebar-collapse"
            @click="toggleCollapsed"
          >
            <!-- 本家は同じ絵を 180 度回して「開く」に使う -->
            <UIcon
              name="upstream:chevron-double-left"
              class="block size-5 transition-transform"
              :class="collapsed ? 'rotate-180' : ''"
            />
          </button>
        </div>

        <ul class="sb-sidebar-nav">
          <li v-for="section in sections" :key="section.to">
            <NuxtLink
              :to="linkOf(section.to)"
              class="sb-navitem"
              :class="collapsed ? 'justify-center' : ''"
              :active-class="section.to === '' ? '' : 'sb-navitem-on'"
              exact-active-class="sb-navitem-on"
              :title="collapsed ? section.label : undefined"
              :data-testid="`sidebar-${section.to || 'overview'}`"
            >
              <!-- 絵は畳んでも出したまま。落ちるのはラベルだけ（本家と同じ） -->
              <UIcon :name="section.icon" class="size-5 shrink-0" />
              <span v-if="!collapsed" class="sb-sidebar-label">{{ section.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <!-- 本家の本文余白は px-6 py-6（App.tsx の main）。サイドバーの幅は main.css -->
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
