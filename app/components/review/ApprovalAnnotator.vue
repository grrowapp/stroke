<script setup lang="ts">
/**
 * 承認対象の文書に指摘を付ける面。本家の `ApprovalsAnnotator.tsx` に対応する。
 *
 * 見せ方は本家と同じ3つ。
 *
 * - `preview`    — 整形して読む。ここからは指摘を付けられない
 * - `annotate`   — 生テキスト。**指摘を付けられるのはこの面だけ**
 * - `side-by-side` — 左が生テキスト、右が整形
 *
 * 指摘はレンダリング後の HTML ではなく生テキストに対して付け、位置は文字オフセットで
 * 持つ（`ReviewAnnotateSource`）。同じ語が本文に何度現れても、選んだ箇所だけが残る。
 *
 * `preview` の中身はこの部品が決めない。承認画面は対象文書をその場で直せるので
 * （specs/document-editing）、そこに何を置くかは呼ぶ側が `#preview` スロットで渡す。
 * スロットは面を切り替えても外さない。外すと編集の直しかけが黙って消える。
 *
 * 溜めた指摘は差し戻し（`needs-revision`）で本家へ渡る。承認・却下は指摘を運ばないので
 * ここには置かない（承認一覧の `ApprovalCard` が持つ）。
 */
import { useMounted } from '@vueuse/core';
import { computed, navigateTo, refreshNuxtData, ref } from '#imports';

import AnnotateSource from '~/components/review/AnnotateSource.vue';
import CommentCard from '~/components/review/CommentCard.vue';
import CommentModal from '~/components/review/CommentModal.vue';
import { useAnnotations } from '~/composables/useAnnotations';
import { pendingApprovalsKey, respondToApproval } from '~/composables/workspace/useProjectApi';

import type { Annotation, HighlightColor } from '#shared/stroke';

const props = defineProps<{
  /** 対象文書の生テキスト。注釈のオフセットはこの文字列に対して付く */
  source: string;
  projectId: string;
  approvalId: string;
  /** 本家に繋がっていないと送れない */
  canRespond?: boolean;
}>();

/** 本文の見せ方。名前は本家（`ViewMode`）と同じ */
type ViewMode = 'preview' | 'annotate' | 'side-by-side';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'preview', label: 'プレビュー' },
  { value: 'annotate', label: '注釈' },
  { value: 'side-by-side', label: '並列表示' },
];

/**
 * 開いたときは整形して読む面にする。本家も `MDXEditorWrapper mode="view"` で開く。
 * 承認は読んで判断する場で、いきなり生テキストにはしない。
 */
const mode = ref<ViewMode>('preview');

/** 指摘を付けられる面かどうか。生テキストが出ている面だけ */
const annotatable = computed(() => mode.value !== 'preview');

const a = useAnnotations();
const comments = a.comments;

// --- 本文へのコメント（選んだ箇所に付く）

interface PendingSelection {
  text: string;
  start: number;
  end: number;
}

const commentModalOpen = ref(false);
const pending = ref<PendingSelection | null>(null);
const editingId = ref<string | null>(null);

/** 編集中のコメント。種別ごとに面が違うので、それぞれの面が自分の分だけを見る */
function editingOf(type: Annotation['type']): Annotation | null {
  const id = editingId.value;
  if (id === null) return null;
  const found = comments.value.find((c) => c.id === id);
  return found !== undefined && found.type === type ? found : null;
}

const editing = computed(() => {
  const c = editingOf('selection');
  return c !== null && c.type === 'selection' ? c : null;
});

const editingGeneral = computed(() => editingOf('general'));

function onSelect(selection: PendingSelection): void {
  pending.value = selection;
  editingId.value = null;
  commentModalOpen.value = true;
}

/** 本文上のハイライトからも、カードの「編集」からも来る */
function editComment(id: string): void {
  const c = comments.value.find((x) => x.id === id);
  if (c === undefined) return;

  editingId.value = id;

  switch (c.type) {
    case 'general':
      generalDraft.value = c.comment;
      generalModalOpen.value = true;
      return;
    case 'selection':
      pending.value = { text: c.selectedText, start: c.startOffset, end: c.endOffset };
      commentModalOpen.value = true;
      return;
  }
}

function saveComment(body: string, color: HighlightColor): void {
  if (editingId.value !== null) {
    a.update(editingId.value, body, color);
  } else if (pending.value !== null) {
    a.addSelection(body, pending.value.text, pending.value.start, pending.value.end, color);
  }
  pending.value = null;
  editingId.value = null;
}

// --- 全体へのコメント（箇所に紐づかない）

const generalModalOpen = ref(false);
const generalDraft = ref('');

function openGeneral(): void {
  editingId.value = null;
  generalDraft.value = '';
  generalModalOpen.value = true;
}

function closeGeneral(): void {
  editingId.value = null;
  generalModalOpen.value = false;
}

function saveGeneral(): void {
  if (editingId.value !== null) {
    a.update(editingId.value, generalDraft.value);
  } else {
    a.addGeneral(generalDraft.value);
  }
  editingId.value = null;
  generalModalOpen.value = false;
}

// --- 消す

const deleteId = ref<string | null>(null);

function confirmDelete(): void {
  if (deleteId.value !== null) a.remove(deleteId.value);
  deleteId.value = null;
}

// --- 差し戻し

const sending = ref(false);
const failure = ref<string | null>(null);

/**
 * 接続状態はブラウザに渡ってからでないと分からない（`useBoardSocket` は SSR で繋がない）。
 * そのまま出すと「送れません」が一瞬出てから消えるので、確定するまでは出さない
 * （`DocumentEditor` と同じ扱い）。
 */
const mounted = useMounted();

const cannotRespond = computed(() => mounted.value && props.canRespond === false);

/**
 * 指摘を付けて本家へ返す。
 *
 * 送るのは `response` / `annotations` / `comments` の3つで、本家は承認リクエストと同じ
 * 1ファイルに3つのフィールドとして書く。1本のテキストに畳まないのは、箇所と指摘の
 * 対応が畳むと失われるため。
 *
 * コメントが0件なら送らない。理由の無い差し戻しを本家に残さない（本家も同じく止める）。
 */
async function requestRevision(): Promise<void> {
  if (sending.value) return;

  if (comments.value.length === 0) {
    failure.value =
      'コメントが1件もありません。「注釈」か「並列表示」に切り替えて本文を選ぶか、「全体へのコメント」を足してから差し戻してください。';
    return;
  }

  sending.value = true;
  failure.value = null;

  const reason = await respondToApproval(
    props.projectId,
    props.approvalId,
    'needs-revision',
    a.buildRevisionPayload(),
  );

  sending.value = false;

  if (reason !== null) {
    failure.value = reason;
    return;
  }

  // 本家が保留中から外すので、この承認依頼の画面はもう空になる。一覧へ戻す。
  //
  // 戻る前に保留中の一覧を捨てる。一覧ページと詳細ページは同じキーでこれを取っており、
  // 捨てないと**一覧が詳細ページで取った古い中身をそのまま描く**（差し戻したはずの
  // 承認依頼が残って見える）。先回りして画面から消すのではなく、本家から取り直させる。
  a.clear();
  await refreshNuxtData(pendingApprovalsKey(props.projectId));
  await navigateTo(`/projects/${props.projectId}/approvals`);
}
</script>

<template>
  <div>
    <!--
      面の切替。本家は3つを1つの枠に収めた segmented control で出す。選んでいるものだけを
      アクセントで塗り、残りは塗らない（本家 `ApprovalsPage` の View Mode Tabs）。
      承認済みの表示は無い（本家は保留中しか返さない・ADR-0006）
    -->
    <div class="sb-segmented mb-4" data-testid="approval-modes">
      <button
        v-for="m in MODES"
        :key="m.value"
        type="button"
        class="sb-segmented-item"
        :class="mode === m.value ? 'sb-segmented-item-on' : ''"
        :aria-pressed="mode === m.value"
        :data-testid="`approval-mode-${m.value}`"
        @click="mode = m.value"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="min-w-0 lg:col-span-2">
        <!--
          プレビュー。中身は呼ぶ側が決める（承認画面は編集できる文書をここに置く）。
          面を切り替えても外さない: 外すと編集の直しかけが黙って消える
        -->
        <div v-show="mode === 'preview'">
          <!-- 本文の枠は呼ぶ側が持つ（編集の口が枠の外に出るため。`DocumentEditor` 参照） -->
          <slot name="preview" />
        </div>

        <!--
          注釈: 生テキスト。指摘を付けられるのはこの面だけ。

          本家（`ApprovalsAnnotator`）は本文の列をまるごと1つの枠に入れ、その中に沈んだ面
          （surface-inset）の箱を置く。操作の帯とデータの領域を切っているのはこの外側の枠で、
          どの面に切り替えても枠は変わらない。
        -->
        <div v-if="mode === 'annotate'" class="sb-panel" data-testid="approval-body">
          <AnnotateSource
            :source="source"
            :comments="comments"
            class="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-inset)]"
            data-testid="approval-annotate-source"
            @select="onSelect"
            @click-mark="editComment"
          />
        </div>

        <!-- 並列表示: 左が注釈、右が整形。本家も外側は1つの枠 -->
        <div v-else-if="mode === 'side-by-side'" class="sb-panel" data-testid="approval-body">
          <div class="grid gap-4 md:grid-cols-2">
            <AnnotateSource
              :source="source"
              :comments="comments"
              class="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-inset)]"
              data-testid="approval-annotate-source"
              @select="onSelect"
              @click-mark="editComment"
            />
            <!--
              右は読むだけの整形。`DocumentView` を使うと `document-content` が
              プレビューのぶんと2つになるので、ここは素で描く
            -->
            <!-- class 列は `DocumentView.vue` と同じ本家写し（`SideBySideView.tsx` も同じ並び） -->
            <div
              class="sb-markdown prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-img:max-w-full prose-img:h-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-pre:bg-gray-50 dark:prose-pre:bg-gray-900 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 min-w-0"
              data-testid="approval-rendered"
            >
              <MDC :value="source" />
            </div>
          </div>
        </div>
      </div>

      <!-- 指摘の一覧。どの面でも出す（本家も出したままにする） -->
      <aside
        class="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)]"
        data-testid="approval-comments"
      >
        <!--
          指摘の見出し帯。本家は `p-3 sm:p-4 border-b bg-[var(--surface-inset)] rounded-t-lg`
          で、パネルの中で一段沈んだ帯になる（実測: 余白 12px / 面 #0f172a）。
          見出しは `font-medium text-sm sm:text-base`＝14px で、左に 20px の吹き出しの絵。
        -->
        <div
          class="rounded-t-[var(--radius-lg)] border-b border-[var(--border-default)] bg-[var(--surface-inset)] p-3"
        >
          <!-- 数の span は flex の子にしない（gap が数の前後に入って「コメント（ 0 ）」になる） -->
          <h4 class="mb-3 flex items-center gap-3 font-medium text-[var(--text-primary)]">
            <UIcon name="upstream:chat" class="h-5 w-5 flex-shrink-0" />
            <span>
              コメント（<span data-testid="approval-comment-count">{{ comments.length }}</span>）
            </span>
          </h4>

          <p v-if="!annotatable" class="text-xs text-[var(--text-muted)]">
            「注釈」か「並列表示」に切り替えると、本文を選んでコメントを付けられます。
          </p>

          <!--
            本家のこのボタンは `.btn` ではなく
            `w-full px-3 py-2 bg-[var(--accent-primary)] text-white rounded-lg text-xs sm:text-sm`。
            実測 12px / 400 / padding 8px 12px / 角丸 8px / 枠なし。`.sb-action` は
            角丸 6px・600 相当なので、ここだけ本家の指定をそのまま持つ。
          -->
          <button
            v-else
            type="button"
            class="flex w-full items-center justify-center gap-3 rounded-[var(--radius-lg)] bg-[var(--accent-primary)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--interactive-primary-hover)]"
            data-testid="approval-add-general"
            @click="openGeneral"
          >
            <UIcon name="upstream:document" class="h-4 w-4" />
            全体へのコメント
          </button>
        </div>

        <div class="flex-1 space-y-3 overflow-y-auto p-3">
          <p
            v-if="comments.length === 0"
            class="py-6 text-center text-sm text-[var(--text-muted)]"
            data-testid="approval-comments-empty"
          >
            まだコメントがありません。
          </p>

          <div v-for="c in comments" :key="c.id" data-testid="approval-comment">
            <CommentCard :comment="c" @edit="editComment" @remove="deleteId = $event" />
          </div>
        </div>

        <!--
          差し戻し。承認・却下と違い、指摘を運ぶのはこれだけである。
          承認・却下はこの画面に置かない（承認一覧の `ApprovalCard` が持つ）
        -->
        <div class="border-t border-[var(--border-default)] p-3">
          <button
            type="button"
            class="sb-action w-full justify-center"
            :disabled="sending || cannotRespond"
            data-testid="approval-revision"
            @click="requestRevision"
          >
            {{ sending ? '差し戻し中…' : `差し戻す（${comments.length}）` }}
          </button>

          <p v-if="cannotRespond" class="mt-2 text-xs text-[var(--text-muted)]">
            本家に繋がっていないため送れません。
          </p>

          <p
            v-if="failure !== null"
            class="sb-error mt-2"
            data-testid="approval-revision-failure"
          >
            {{ failure }}
          </p>
        </div>
      </aside>
    </div>

    <!-- 本文へのコメント（追加・編集） -->
    <CommentModal
      v-model:open="commentModalOpen"
      :selected-text="pending?.text ?? ''"
      :initial-comment="editing?.comment"
      :initial-color="editing?.highlightColor"
      :is-editing="editingId !== null"
      @save="saveComment"
    />

    <!-- 全体へのコメント。箇所も色も無いので本文だけを入れさせる -->
    <UModal
      v-model:open="generalModalOpen"
      :title="editingGeneral ? '全体へのコメントを編集' : '全体へのコメント'"
    >
      <template #body>
        <UTextarea
          v-model="generalDraft"
          :rows="5"
          class="w-full"
          placeholder="この文書全体について"
          autofocus
        />
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="closeGeneral">やめる</UButton>
        <UButton :disabled="!generalDraft.trim()" @click="saveGeneral">
          {{ editingGeneral ? '更新' : '付ける' }}
        </UButton>
      </template>
    </UModal>

    <!-- 消す確認 -->
    <UModal
      :open="deleteId !== null"
      title="このコメントを消す"
      @update:open="deleteId = null"
    >
      <template #body>
        <p class="text-sm text-[var(--text-muted)]">消したコメントは戻せません。</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" @click="deleteId = null">やめる</UButton>
        <UButton color="error" @click="confirmDelete">消す</UButton>
      </template>
    </UModal>
  </div>
</template>
