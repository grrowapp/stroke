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
    <h1 class="sb-page-title">承認</h1>

    <p v-if="error" class="sb-placeholder" data-testid="approvals-error">
      承認依頼を取得できませんでした。本家に繋がっていない可能性があります。
    </p>

    <p v-else-if="pending.length === 0" class="sb-placeholder" data-testid="approvals-empty">
      保留中の承認依頼はありません。処理済みのものは本家が返さないため、ここには残りません。
    </p>

    <div v-else class="flex gap-4">
      <ul class="w-72 shrink-0 space-y-2" data-testid="approvals-list">
        <li v-for="approval in pending" :key="approval.id">
          <button
            type="button"
            class="sb-card w-full text-left"
            :style="
              selected === approval.id
                ? { borderColor: 'var(--interactive-primary)', background: 'var(--accent-primary-muted)' }
                : undefined
            "
            data-testid="approval-row"
            :data-category="approval.category"
            @click="selected = approval.id"
          >
            <div class="text-[13px] font-semibold">{{ approval.title }}</div>
            <div class="mt-1 flex items-center gap-2">
              <span class="sb-chip">{{ categoryLabel[approval.category] ?? approval.category }}</span>
              <span class="truncate font-mono text-[11px] text-[var(--text-muted)]">
                {{ approval.filePath }}
              </span>
            </div>
          </button>
        </li>
      </ul>

      <article class="min-w-0 flex-1">
        <pre
          v-if="document"
          class="sb-card overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed"
          data-testid="approval-content"
        >{{ document.content }}</pre>
      </article>
    </div>
  </section>
</template>
