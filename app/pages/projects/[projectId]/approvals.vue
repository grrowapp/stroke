<script setup lang="ts">
/**
 * 下層 — 承認。承認依頼の通知の飛び先（ADR-0003）。
 *
 * 対象が仕様ドキュメントでもステアリング文書でもここへ来る。本家の ApprovalsPage が
 * filePath の中身を取得して画面内に描画しており、承認画面が対象文書のレビュー面
 * そのものだからである。
 *
 * 承認・却下の操作は置かない。本家は保留中のものしか返さないため、既に処理済みの
 * 承認依頼は一覧から消えているだけになる（specs/project-workspace）。
 */
import { computed, definePageMeta, ref, useFetch, useRoute } from '#imports';

definePageMeta({ layout: 'workspace' });

const route = useRoute();
const projectId = computed(() => String(route.params.projectId ?? ''));

const { data: approvals, error } = await useFetch(() => `/api/projects/${projectId.value}/approvals`);
const pending = computed(() => approvals.value ?? []);

// 承認依頼は上の await で解決済みなので、ここで同期的に初期値を決められる
const selected = ref<string | null>(pending.value[0]?.id ?? null);

const { data: document } = await useFetch(
  () => `/api/projects/${projectId.value}/approvals/${selected.value}/content`,
  { immediate: selected.value !== null },
);

const categoryLabel: Record<string, string> = { spec: '仕様', steering: 'ステアリング' };
</script>

<template>
  <section>
    <h1 class="mb-4 text-lg font-semibold text-highlighted">承認</h1>

    <p v-if="error" class="text-muted" data-testid="approvals-error">
      承認依頼を取得できませんでした。本家に繋がっていない可能性があります。
    </p>

    <p v-else-if="pending.length === 0" class="text-muted" data-testid="approvals-empty">
      保留中の承認依頼はありません。処理済みのものは本家が返さないため、ここには残りません。
    </p>

    <div v-else class="flex gap-6">
      <ul class="w-72 shrink-0 space-y-2" data-testid="approvals-list">
        <li v-for="approval in pending" :key="approval.id">
          <button
            type="button"
            class="w-full rounded border border-default px-3 py-2 text-left text-sm"
            :class="selected === approval.id ? 'bg-elevated text-highlighted' : 'text-muted'"
            data-testid="approval-row"
            :data-category="approval.category"
            @click="selected = approval.id"
          >
            <div class="text-highlighted">{{ approval.title }}</div>
            <div class="text-muted">
              {{ categoryLabel[approval.category] ?? approval.category }} / {{ approval.filePath }}
            </div>
          </button>
        </li>
      </ul>

      <article class="min-w-0 flex-1">
        <pre
          v-if="document"
          class="overflow-x-auto whitespace-pre-wrap rounded border border-default p-3 text-sm"
          data-testid="approval-content"
        >{{ document.content }}</pre>
      </article>
    </div>
  </section>
</template>
