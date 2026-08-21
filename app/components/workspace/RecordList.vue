<script setup lang="ts">
/**
 * 下層の一覧。各行はリンクで、URL で対象を指せるようにする。
 *
 * 本家のダッシュボードは `projectId` を localStorage に持ち URL に出さないため、
 * 「どのプロジェクトの何」を指すリンクが作れない。stroke-board がそれを繰り返さない
 * ように、一覧の各行は必ず固有の URL を持つ（product.md の Purpose）。
 *
 * 見た目の出どころは本家の一覧（`SteeringPage.tsx` の `SteeringDocumentRow` と
 * `SpecsPage.tsx` の `SpecTableRow`）。行頭に 40px のアイコンタイル、その右に2段の
 * テキスト、状態、最終更新、右端に「開く」を表す目のアイコン、という並びが本家の形。
 *
 * prototype はこの層について「下層の中身はこの問いの対象外」と書いているだけなので、
 * ここは本家に合わせる。上層の表（`sb-table`）とは別の様式である点に注意。
 */
import { navigateTo } from '#imports';

import UpstreamIcon from '~/components/shared/UpstreamIcon.vue';

export type RecordTone = 'success' | 'pending' | 'info' | 'in-progress' | 'warning' | 'error';

export interface RecordItem {
  /** 一覧内で一意 */
  key: string;
  label: string;
  /** 行の下段に出す補足。無ければ出さない */
  detail?: string;
  /** 行頭のタイルに載せるアイコン。本家は文書に document、タスクに tasks を使う */
  icon?: 'document' | 'steering' | 'tasks' | 'check-circle';
  /** 状態の列。本家の status-badge */
  badge?: { text: string; tone: RecordTone };
  /** 状態の列に進捗を出す場合。badge と併用しない */
  progress?: { completed: number; total: number };
  /** 3列目。最終更新など */
  meta?: string;
  /** 遷移先。無ければ選べない行になる */
  to?: string;
}

const props = withDefaults(
  defineProps<{
    items: RecordItem[];
    testid?: string;
    /** 列見出し。本家は画面ごとに文言が違うので、呼び出し側から渡す */
    labels?: { name: string; status: string; meta: string };
  }>(),
  { labels: () => ({ name: '名前', status: '状態', meta: '最終更新' }) },
);

/**
 * その列を1件でも使っていれば出す。全件空なら列ごと畳む。
 *
 * 行が1件も無いときは畳まない。本家は0件でも列見出しを残したうえで空の状態を足す
 * （`SpecsPage.tsx` の Empty State）。見出しごと消すと何の一覧なのかが分からなくなる。
 */
function uses(field: 'badge' | 'progress' | 'meta'): boolean {
  return props.items.length === 0 || props.items.some((item) => item[field] !== undefined);
}

function percent(progress: { completed: number; total: number }): number {
  return progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
}

/** 本家と同じく行のどこを押しても開く。押せない行では何も起きない */
function open(item: RecordItem): void {
  if (item.to === undefined) return;
  void navigateTo(item.to);
}
</script>

<template>
  <table class="sb-datatable" :data-testid="testid">
    <thead>
      <tr>
        <th scope="col">{{ labels.name }}</th>
        <th v-if="uses('badge') || uses('progress')" scope="col">{{ labels.status }}</th>
        <th v-if="uses('meta')" scope="col">{{ labels.meta }}</th>
        <!-- 本家は操作列の見出しを持つが、stroke-board に操作は無いので空にする -->
        <th scope="col" class="w-12"><span class="sr-only">開く</span></th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in items"
        :key="item.key"
        :class="item.to ? 'sb-datarow' : 'sb-datarow-off'"
        data-testid="record-row"
        :data-key="item.key"
        :data-disabled="item.to ? undefined : true"
        @click="open(item)"
      >
        <td>
          <div class="flex items-center">
            <span class="sb-icon-tile">
              <UpstreamIcon :name="item.icon ?? 'document'" />
            </span>
            <span class="ml-4 min-w-0">
              <!--
                行そのものではなくリンクにして、キーボードだけで辿って開けるようにする。
                押せない行はリンクにしない（フォーカスも受けない）。
              -->
              <NuxtLink
                v-if="item.to"
                :to="item.to"
                class="block truncate font-medium text-[var(--text-primary)] hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
                data-testid="record-open"
                @click.stop
              >
                {{ item.label }}
              </NuxtLink>
              <span v-else class="block truncate font-medium text-[var(--text-primary)]">
                {{ item.label }}
              </span>
              <span
                v-if="item.detail"
                class="block truncate text-[var(--text-secondary)]"
              >
                {{ item.detail }}
              </span>
            </span>
          </div>
        </td>

        <td v-if="uses('badge') || uses('progress')">
          <span
            v-if="item.badge"
            class="sb-status-badge"
            :class="`sb-status-badge-${item.badge.tone}`"
          >
            {{ item.badge.text }}
          </span>
          <span v-else-if="item.progress" class="flex items-center gap-2">
            <span class="sb-progress-track block w-20">
              <span
                class="sb-progress-fill block"
                :style="{ width: `${percent(item.progress)}%` }"
              />
            </span>
            <span class="whitespace-nowrap text-[var(--text-secondary)]">
              {{ item.progress.completed }}/{{ item.progress.total }}
            </span>
          </span>
          <span v-else class="text-[var(--text-muted)]">—</span>
        </td>

        <td v-if="uses('meta')" class="text-[var(--text-secondary)]">{{ item.meta ?? '—' }}</td>

        <td>
          <!-- 本家は行の右端に目のアイコンを置いて「開ける」ことを示す -->
          <UpstreamIcon name="eye" class="h-5 w-5 text-[var(--text-muted)]" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
