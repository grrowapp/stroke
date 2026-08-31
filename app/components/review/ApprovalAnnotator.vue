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

import MarkdownView from '#markdown/render/MarkdownView.vue';
import AnnotateSource from '~/components/review/AnnotateSource.vue';
import CommentCard from '~/components/review/CommentCard.vue';
import CommentModal from '~/components/review/CommentModal.vue';
import { useAnnotations } from '~/composables/useAnnotations';
import { pendingApprovalsKey, respondToApproval } from '~/composables/useProjectApi';
// PROTOTYPE — throwaway（adr0017-sub-full-width-markdown-editor の ui.md 用）
import { usePrototypePanels } from '~/composables/usePrototypePanels';

import type { Annotation, HighlightColor } from '#shared/stroke';

/* PROTOTYPE — 右の指摘の一覧をしまう／戻す */
const { rightTucked, tuckRight, untuckRight } = usePrototypePanels();

/*
 * PROTOTYPE — コメント欄そのものを掴んで左右へ引く。
 *
 * 掴む所を1箇所に絞らない。パネルのどこを掴んでも幅が指に追従し、放した位置で
 * 開くか引っ込むかが決まる。中のボタンや入力の上から始めた場合は掴まない
 * （押せなくなるため）。動かさずに放したときは何もしない＝ただのクリックを潰さない。
 */
const asideEl = ref<HTMLElement | null>(null);
const dragging = ref(false);
const dragWidth = ref<number | null>(null);

const TUCKED_WIDTH = 44;
/** この幅より動かして初めて「掴んだ」とみなす。クリックと区別する */
const DRAG_SLOP = 6;

let startX = 0;
let baseWidth = 0;
let openWidth = 0;
let moved = false;

function onDragMove(event: PointerEvent): void {
  const dx = event.clientX - startX;
  if (Math.abs(dx) > DRAG_SLOP) moved = true;
  dragWidth.value = Math.min(openWidth, Math.max(TUCKED_WIDTH, baseWidth - dx));
}

function onDragEnd(): void {
  window.removeEventListener('pointermove', onDragMove);
  const width = dragWidth.value;
  dragging.value = false;
  dragWidth.value = null;
  if (!moved || width === null) return;
  // 放した位置が開いた幅の半分より狭ければしまう
  if (width < openWidth / 2) tuckRight();
  else untuckRight();
}

function onDragStart(event: PointerEvent): void {
  /*
   * 開いているときは、中のボタンや入力の上から掴まない（押せなくなる）。
   * 引っ込んだ帯には他の操作が無いので、帯そのものからも掴める。
   */
  const target = event.target as HTMLElement | null;
  if (!rightTucked.value && target?.closest('button, a, textarea, input, select')) return;
  const el = asideEl.value;
  const row = el?.parentElement;
  if (!el || !row) return;

  startX = event.clientX;
  baseWidth = el.getBoundingClientRect().width;
  openWidth = Math.round(row.getBoundingClientRect().width / 3);
  moved = false;
  dragging.value = true;

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
}

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

    <!--
      PROTOTYPE — grid（1:2 固定）から flex へ替え、右の一覧の幅を可変にした。
      引っ込めても幅を 0 にせず、つまみ幅だけ残す。真ん中の面に固定幅は与えない。
    -->
    <div class="flex gap-4">
      <div class="min-w-0 flex-1">
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
            <!-- 本文の型は markdown モジュールが持つ（本家写し。`SideBySideView.tsx` も同じ並び） -->
            <MarkdownView :value="source" testid="approval-rendered" class="min-w-0" />
          </div>
        </div>
      </div>

      <!--
        PROTOTYPE — 引っ込んだときのつまみ。3案で残すものが違う。
          a: 縦書きで「コメント」と件数
          b: 掴むところだけ（‹ の丸）。しまう口と同じ位置に出る
          c: 見出しの絵と件数バッジ（見出し帯が細くなって残る形）
        どれもワンクリックで右だけ戻す。左には触らない。
      -->
      <!--
        指摘の一覧。どの面でも出す（本家も出したままにする）。

        PROTOTYPE — 要素を入れ替えず、この1枚の幅だけを変えてスライドさせる。
        引っ込んでもつまみ幅は残し、その中に何のつまみかを出す。
      -->
      <aside
        ref="asideEl"
        class="relative flex min-w-0 shrink-0 select-none flex-col rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)]"
        :class="[
          rightTucked ? 'w-11' : 'w-1/3',
          dragging ? 'cursor-grabbing' : 'cursor-grab transition-[width] duration-300 ease-out',
        ]"
        :style="dragWidth === null ? undefined : { width: `${dragWidth}px` }"
        data-testid="approval-comments"
        @pointerdown="onDragStart"
      >
        <!--
          PROTOTYPE — 開閉の口。**開いていても引っ込んでいても同じ場所**に出す。
          `aside` の右辺は常に画面端に張り付いていて動かないので、右上角に置けば座標が変わらない。
          押せることが分かるように hover と押下で面の色を変える。
        -->
        <!--
          パネルの境界に貼り付くつまみ。`aside` はビューポートより高くなるので、
          要素の中央（top-1/2）に置くと画面外へ落ちる。スクロールに追従させて
          常に画面の中ほどに出す。
        -->
        <button
          type="button"
          class="group absolute inset-y-0 right-0 z-20 w-5 cursor-pointer rounded-r-[var(--radius-lg)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)] active:bg-[var(--accent-primary)]"
          :aria-label="rightTucked ? 'コメントの一覧を出す' : 'コメントの一覧をしまう'"
          :title="rightTucked ? 'コメントの一覧を出す' : 'コメントの一覧をしまう'"
          data-testid="approval-comments-toggle"
          @click="rightTucked ? untuckRight() : tuckRight()"
        >
          <!--
            掴む目印は境界の全高に渡すレール。どの高さでも目の前に在るので、
            縦に長い本文をスクロールしていても掴む所を探しに戻らなくてよい。
          -->
          <span
            class="absolute inset-y-2 left-1/2 w-1 -translate-x-1/2 rounded-full bg-[var(--border-default)] transition-colors group-hover:bg-[var(--accent-primary)]"
          />
        </button>

        <!--
          PROTOTYPE — 引っ込んだときに残すもの。何のつまみかが読める。
          帯のどこを押しても開く（真ん中でも端でも当たる）。
        -->
        <button
          v-if="rightTucked"
          type="button"
          class="flex h-full w-full cursor-pointer flex-col items-center bg-[var(--surface-inset)] py-4 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="コメントの一覧を出す"
          data-testid="approval-comments-handle"
          @click="untuckRight"
        >
          <!-- 帯は本文と同じ高さまで伸びる。中身を上端に置くと、スクロールした先で何も見えない -->
          <span class="sticky top-[40vh] flex flex-col items-center gap-3">
            <span class="rounded-full bg-[var(--accent-primary)] px-1.5 text-[10px] text-white">
              {{ comments.length }}
            </span>
            <span class="text-xs tracking-widest" style="writing-mode: vertical-rl">コメント</span>
          </span>
        </button>

        <template v-else>
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

            <!--
              PROTOTYPE — 畳むボタン。左サイドバーの `sidebar-collapse` と同じ作りで、
              帯の中の右端に置く。右端のレールは補助で、主の口はこちら。
            -->
            <button
              type="button"
              class="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-lg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] active:bg-[var(--accent-primary)] active:text-white"
              aria-label="コメントの一覧をしまう"
              title="コメントの一覧をしまう"
              data-testid="approval-comments-tuck"
              @click="tuckRight"
            >
              <UIcon name="upstream:chevron-double-left" class="block size-5 rotate-180" />
            </button>
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
        </template>
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
