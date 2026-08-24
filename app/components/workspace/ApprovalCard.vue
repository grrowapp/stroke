<script setup lang="ts">
/**
 * 承認依頼1件のカード。
 *
 * 本家の承認画面は一覧ではなく**カードの縦積み**（`ApprovalsPage.tsx` の
 * `space-y-3 sm:space-y-4` の中に1件1枚）。他の下層画面が表なのに対し、ここだけ形が違う。
 * 表に置き換えると本家と別物になるので、本家の並びをそのまま写す。
 *
 * 1枚の中身は本家の順で 件名 → 対象ファイル → 状態と発生時刻 → 操作。
 * 操作は本家の Review & Annotate / Quick Approve / Quick Reject に対応させ、
 * 差し戻し（needs-revision）は入れない。本家のそれは注釈コメントを前提にした流れで、
 * stroke-board はコメントを持たないため。
 *
 * 承認・却下は本家の API を呼ぶだけで、`.spec-workflow/` に書くのは本家である。
 */
import { $fetch, navigateTo, ref } from '#imports';

import UpstreamIcon from '~/components/shared/UpstreamIcon.vue';
import type { ApprovalDto } from '#shared/types';

const props = defineProps<{ approval: ApprovalDto; to: string; projectId: string }>();
const emit = defineEmits<{ responded: [] }>();

/** 一覧の行と同じく、カードのどこを押しても開く */
function open(): void {
  void navigateTo(props.to);
}

/** 本家は日時を `Aug 17, 02:26 PM` の形で出す。ここは日本語のみなので同じ粒度で和文にする */
function formatDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '不明';

  return `${at.getMonth() + 1}月${at.getDate()}日 ${String(at.getHours()).padStart(2, '0')}:${String(
    at.getMinutes(),
  ).padStart(2, '0')}`;
}

const busy = ref<'approve' | 'reject' | null>(null);
const failure = ref<string | null>(null);

/** 却下は理由が本家に残る。本家も入力させてから送る */
const rejecting = ref(false);
const reason = ref('');

async function respond(action: 'approve' | 'reject', response?: string): Promise<void> {
  busy.value = action;
  failure.value = null;

  try {
    await $fetch(`/api/projects/${props.projectId}/approvals/${props.approval.id}/${action}`, {
      method: 'POST',
      body: { response },
    });

    rejecting.value = false;
    reason.value = '';
    // 本家が保留中から外すので、一覧を取り直させる
    emit('responded');
  } catch {
    failure.value =
      action === 'approve' ? '承認できませんでした。' : '却下できませんでした。';
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div
    class="cursor-pointer rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)] transition-colors hover:border-[var(--border-strong)]"
    data-testid="record-row"
    :data-key="approval.id"
    @click="open"
  >
    <!--
      本家のカードは `p-3 sm:p-4 md:p-6 lg:p-8` と書かれているが、本家自身の CSS が
      `.p-3 { padding: var(--space-3) }` を素のクラスとして定義しており、Tailwind の
      レスポンシブ指定を打ち消している。稼働中の本家で実測すると常に 12px。
      書いてある方ではなく、実際にそう見えている方に合わせる。
    -->
    <div class="p-3">
      <div class="flex items-start justify-between">
        <div class="min-w-0 flex-1">
          <h3 class="mb-2 truncate text-lg font-medium text-[var(--text-primary)] md:text-xl">
            {{ approval.title }}
          </h3>

          <!-- 対象ファイル。本家は文書アイコン + 相対パス。行は text-sm（12px） -->
          <div
            class="mb-2 flex min-w-0 max-w-full items-center gap-1 text-sm text-[var(--text-muted)]"
            data-testid="approval-path"
          >
            <UpstreamIcon name="document" class="h-4 w-4 flex-shrink-0" />
            <span class="min-w-0 truncate break-all text-xs">{{ approval.filePath }}</span>
          </div>

          <!-- 状態と発生時刻。本家は保留中を warning 色で出す。行は text-sm（12px） -->
          <div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span
              class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
              style="background: var(--status-warning-muted); color: var(--status-warning)"
              data-testid="approval-status"
            >
              <UpstreamIcon name="clock" class="mr-1 h-3 w-3" />
              保留中
            </span>

            <span
              class="flex items-center gap-1 font-mono tabular-nums text-[var(--text-faint)]"
              data-testid="approval-created"
            >
              <UpstreamIcon name="calendar" class="h-4 w-4" />
              {{ formatDate(approval.createdAt) }}
            </span>
            <!--
              本家のカードは category を出していない。こちらで足すと本家に無い情報が
              増えるので置かない（ADR-0001）。
            -->
          </div>

          <!-- 操作。押しても行の遷移が起きないよう、この列では伝播を止める -->
          <div class="flex flex-wrap items-center gap-3" @click.stop>
            <!-- 押した先で対象文書がそのまま直せる（specs/document-editing） -->
            <NuxtLink :to="to" class="sb-action" data-testid="record-open">
              <UpstreamIcon name="eye" class="h-4 w-4" />
              レビューする
            </NuxtLink>

            <button
              type="button"
              class="sb-action"
              :disabled="busy !== null"
              data-testid="approval-approve"
              @click="respond('approve')"
            >
              <UpstreamIcon name="check-circle" class="h-4 w-4" />
              {{ busy === 'approve' ? '承認中…' : '承認' }}
            </button>

            <button
              type="button"
              class="sb-action"
              :disabled="busy !== null"
              data-testid="approval-reject"
              @click="rejecting = !rejecting"
            >
              <UpstreamIcon name="alert-circle" class="h-4 w-4" />
              却下
            </button>
          </div>

          <!-- 却下の理由。本家もモーダルで入力させてから送る -->
          <div v-if="rejecting" class="mt-3" data-testid="approval-reject-form" @click.stop>
            <label class="mb-1 block text-sm text-[var(--text-secondary)]" :for="`reason-${approval.id}`">
              却下の理由（本家に応答として残ります）
            </label>
            <textarea
              :id="`reason-${approval.id}`"
              v-model="reason"
              rows="3"
              class="w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-inset)] p-2 text-sm text-[var(--text-primary)]"
              data-testid="approval-reject-reason"
            />
            <div class="mt-2 flex items-center gap-3">
              <button
                type="button"
                class="sb-action"
                :disabled="busy !== null || reason.trim().length === 0"
                data-testid="approval-reject-submit"
                @click="respond('reject', reason)"
              >
                {{ busy === 'reject' ? '却下中…' : '却下する' }}
              </button>
              <button
                type="button"
                class="sb-action sb-action-secondary"
                data-testid="approval-reject-cancel"
                @click="rejecting = false"
              >
                やめる
              </button>
            </div>
          </div>

          <p
            v-if="failure"
            class="mt-2 text-sm"
            style="color: var(--status-error)"
            data-testid="approval-failure"
          >
            {{ failure }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
