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
 *
 * 表そのものは `UTable`（TanStack Table）。table markup と列の組み立てはライブラリに
 * 預け、様式は `:ui` と cell slot で載せる。行を開く操作はリンク1本に集約する
 * （`#name-cell` のコメント）。
 */
import type { TableColumn, TableRow } from '@nuxt/ui';
import { computed } from '#imports';


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
    /**
     * 列見出し。本家は画面ごとに文言が違うので、呼び出し側から渡す。
     * 文言の出どころは本家の日本語ロケール（`locales/ja.json`）。
     */
    labels?: { name: string; status: string; meta: string; actions: string };
  }>(),
  {
    labels: () => ({ name: '名前', status: '状態', meta: '最終更新', actions: 'アクション' }),
  },
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

/** 列の出し分け。中身は同名の cell slot が描く */
const columns = computed<TableColumn<RecordItem>[]>(() => {
  const list: TableColumn<RecordItem>[] = [{ id: 'name', header: props.labels.name }];

  if (uses('badge') || uses('progress')) {
    list.push({ id: 'status', header: props.labels.status });
  }

  if (uses('meta')) {
    list.push({
      id: 'meta',
      header: props.labels.meta,
      // 本家は最終更新の td に `text-sm text-[var(--text-secondary)]`（実測 12px / lh 17.14）
      meta: { class: { td: 'text-sm text-[var(--text-secondary)]' } },
    });
  }

  /*
   * 本家は操作列にも見出しを出す（`SteeringPage.tsx` / `SpecsPage.tsx` の thead）。
   * 幅は指定しない。48px に固定したまま見出しを入れると、文字が最小幅を押し広げて
   * 他の列を圧迫する。本家もこの列に幅指定を持たない。
   */
  list.push({ id: 'actions', header: props.labels.actions });

  return list;
});

/**
 * 押せる行と押せない行の区別。`UTable` の `tr` には任意の属性を張れないため、
 * `meta.class.tr` の class で示す（`.sb-datarow` / `.sb-datarow-off`）。
 */
const rowMeta = {
  class: {
    tr: (row: TableRow<RecordItem>) => (row.original.to ? 'sb-datarow' : 'sb-datarow-off'),
  },
};

/**
 * 既定テーマを丸ごと外し、`.sb-datatable` の様式だけを残す。
 *
 * slot に関数を渡すと既定 class の「置換」になる（`SlotClassReplacer`）。併記にすると
 * 既定の utility（`p-4` / `divide-y` / `hover:bg-elevated/50` など）が utilities layer に
 * 出るため、components layer の `.sb-datatable` を必ず上書きしてしまう。
 */
const ui = {
  root: () => '',
  base: () => 'sb-datatable',
  thead: () => '',
  tbody: () => '',
  tr: () => '',
  th: () => '',
  td: () => '',
  /** 見出しの下に重ねる 1px の線。`.sb-datatable` は thead の背景で区切るので出さない */
  separator: () => 'hidden',
  /** 0件でも列見出しは残すが、本家に無い「データがありません」の行は出さない */
  empty: () => 'hidden',
};
</script>

<template>
  <UTable
    :data="items"
    :columns="columns"
    :meta="rowMeta"
    :ui="ui"
    :data-testid="testid"
  >
    <template #name-cell="{ row }">
      <div class="flex items-center">
        <span class="sb-icon-tile">
          <UIcon :name="`upstream:${row.original.icon ?? 'document'}`" />
        </span>
        <span class="ml-4 min-w-0">
          <!--
            本家と同じく行のどこを押しても開くが、`UTable` の `onSelect` は使わない。
            `onSelect` を渡すと `tr` に `role="button"` と `tabindex="0"` が付く一方で
            `UTable` は keydown を持たないため、Enter で何も起きないタブストップが
            押せない行にまで増える。本家の `tr` は tabindex を持たない。

            代わりにリンクの `::after` を行いっぱいに広げる（`after:absolute after:inset-0`。
            起点は `.sb-datarow` の `position: relative`）。行のどこを押してもこのリンクに
            当たり、タブストップは行ごとに1つ、Enter は `<a>` の既定動作で開く。
            押せない行はリンクを持たないので、押す面も無く、フォーカスも受けない。
          -->
          <NuxtLink
            v-if="row.original.to"
            :to="row.original.to"
            class="block truncate text-sm font-medium text-[var(--text-primary)] after:absolute after:inset-0 hover:text-[var(--interactive-primary)] focus-visible:outline focus-visible:outline-2"
            data-testid="record-open"
          >
            {{ row.original.label }}
          </NuxtLink>
          <span v-else class="block truncate text-sm font-medium text-[var(--text-primary)]">
            {{ row.original.label }}
          </span>
          <!-- 本家は上段が `text-sm font-medium`、下段が `text-sm`（実測 どちらも 12px / lh 17.14） -->
          <span
            v-if="row.original.detail"
            class="block truncate text-sm text-[var(--text-secondary)]"
          >
            {{ row.original.detail }}
          </span>
        </span>
      </div>
    </template>

    <template #status-cell="{ row }">
      <span
        v-if="row.original.badge"
        class="sb-status-badge"
        :class="`sb-status-badge-${row.original.badge.tone}`"
      >
        {{ row.original.badge.text }}
      </span>
      <!--
        本家は総数が 0 より大きいときだけバーを出し、0 のときは「タスクなし」の文字を
        置く（`SpecsPage.tsx` の `spec.taskProgress && total > 0 ? … : t('specsPage.noTasks')`）。
        文言は本家の日本語ロケール（`locales/ja.json` の `specsPage.noTasks`）。
      -->
      <span v-else-if="row.original.progress?.total" class="flex items-center gap-2">
        <span class="sb-progress-track block w-20">
          <span
            class="sb-progress-fill block"
            :style="{ width: `${percent(row.original.progress)}%` }"
          />
        </span>
        <span class="whitespace-nowrap text-sm text-[var(--text-secondary)]">
          {{ row.original.progress.completed }}/{{ row.original.progress.total }}
        </span>
      </span>
      <span v-else-if="row.original.progress" class="text-sm text-[var(--text-muted)]">
        タスクなし
      </span>
      <span v-else class="text-[var(--text-muted)]">—</span>
    </template>

    <template #meta-cell="{ row }">{{ row.original.meta ?? '—' }}</template>

    <!--
      本家は行の右端に目のアイコンを置いて「開ける」ことを示す。
      色は本家の直書き `text-gray-400`（実測 oklch(0.707 0.022 261.325)）。
      design token の `--text-muted` は slate-400 で別の色になる。
    -->
    <template #actions-cell>
      <UIcon name="upstream:eye" class="h-5 w-5 text-gray-400" />
    </template>

    <!-- 0件のときに本家に無い行を足さない。空の状態は呼び出し側の EmptyState が出す -->
    <template #empty />
  </UTable>
</template>
