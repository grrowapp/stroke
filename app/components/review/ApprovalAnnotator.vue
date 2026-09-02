<script setup lang="ts">
/**
 * 承認対象の文書に指摘を付ける面。本家の `ApprovalsAnnotator.tsx` に対応する。
 *
 * 見せ方は2つ。**どちらの面でも指摘を付けられる**（specs/project/ui）。
 *
 * - `preview`  — 整形して読む
 * - `annotate` — 生テキスト（`MarkdownSource`）
 *
 * 両方を並べる面（本家の `side-by-side`）は持たない。あれは読む面と指摘する面が別だったことに
 * 由来する面で、どちらでも付けられるなら要らない（ADR-0017）。
 *
 * 指摘はレンダリング後の HTML ではなく生テキストに対して付け、位置は文字オフセットで
 * 持つ（`ReviewAnnotateSource`）。同じ語が本文に何度現れても、選んだ箇所だけが残る。
 * どちらの面で付けた指摘も両方の面に出て、一方で消せば両方から消える——注釈は `useAnnotations`
 * の1つの一覧で、面はそれを塗っているだけだからである。
 *
 * `preview` の中身はこの部品が決めない。そこに何を置くかは呼ぶ側が `#preview` スロットで
 * 渡す（承認画面は読むだけの整形。編集の口は無い — specs/document-editing）。注釈の面
 * （`ReviewAnnotateSource`）は本文をどう描くかを知らないので、位置の口は呼ぶ側が面の `ref` を
 * `previewPort` で渡し、図に生テキストを添えたい範囲（`sourceShown`）はスロットの props で
 * 呼ぶ側へ返す。スロットは面を切り替えても外さない。外すと描いた本文（図など）が描き直しになる。
 *
 * 右の指摘の一覧（コメント欄）はしまえる（specs/project/ui「承認画面の指摘の一覧はしまえる」）。
 * しまうと 44px のつまみだけが残り、空いた幅は本文が取る。開閉の状態はこの部品の中に閉じ、
 * 左のナビ（`workspace.vue`）とは連動しない。保存もしない。
 *
 * 溜めた指摘は差し戻し（`needs-revision`）で本家へ渡る。承認・却下は指摘を運ばないので
 * ここには置かない（承認一覧の `ApprovalCard` が持つ）。
 */
import { useEventListener, useMounted } from '@vueuse/core';
import { computed, navigateTo, onMounted, refreshNuxtData, ref, useTemplateRef } from '#imports';

import MarkdownSource from '#markdown/render/MarkdownSource.vue';
import AnnotateSource from '~/components/review/AnnotateSource.vue';
import CommentCard from '~/components/review/CommentCard.vue';
import CommentModal from '~/components/review/CommentModal.vue';
import { useAnnotations } from '~/composables/useAnnotations';
import { pendingApprovalsKey, respondToApproval } from '~/composables/useProjectApi';

import type { PositionPort, SourceRange } from '#markdown/position/types';
import type { Annotation, HighlightColor } from '#shared/stroke';

const props = defineProps<{
  /** 対象文書の生テキスト。注釈のオフセットはこの文字列に対して付く */
  source: string;
  projectId: string;
  approvalId: string;
  /** 本家に繋がっていないと送れない */
  canRespond?: boolean;
  /**
   * `#preview` に置いた面が出している位置の口。呼ぶ側が面（`MarkdownView`）の `ref` を
   * そのまま渡す。面がまだ描かれていなければ `null`
   */
  previewPort?: PositionPort | null;
}>();

defineSlots<{
  /**
   * 整形して読む面。`sourceShown` は図に生テキストを添えたい範囲で、置いた `MarkdownView` の
   * 同名の prop へそのまま渡す
   */
  preview(props: { sourceShown: SourceRange[] }): unknown;
}>();

/** 本文の見せ方。名前は本家（`ViewMode`）と同じ。`side-by-side` は持たない */
type ViewMode = 'preview' | 'annotate';

const MODES: { value: ViewMode; label: string }[] = [
  { value: 'preview', label: 'プレビュー' },
  { value: 'annotate', label: '注釈' },
];

/**
 * 開いたときは整形して読む面にする。本家も `MDXEditorWrapper mode="view"` で開く。
 * 承認は読んで判断する場で、いきなり生テキストにはしない。読む面のまま指摘を付けられる。
 */
const mode = ref<ViewMode>('preview');

/**
 * 面ごとの注釈の面。一覧のコメント → 本文の範囲（`reveal`）は、いま出ている面へ向ける。
 * プレビューは `v-show` で残しているので常に在り、生テキストの面は出ているときだけ在る。
 */
const previewAnnotator = useTemplateRef<InstanceType<typeof AnnotateSource>>('previewAnnotator');
const sourceAnnotator = useTemplateRef<InstanceType<typeof AnnotateSource>>('sourceAnnotator');

/** 生テキストの面の位置の口。面の `ref` をそのまま渡す */
const sourceSurface = useTemplateRef<InstanceType<typeof MarkdownSource>>('sourceSurface');

function locate(id: string): void {
  const annotator = mode.value === 'preview' ? previewAnnotator.value : sourceAnnotator.value;
  annotator?.reveal(id);
}

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

// --- コメント欄をしまう／戻す（design 決定1〜3）

/** しまっているか。この部品の中だけで持つ。cookie / localStorage / URL には書かない */
const tucked = ref(false);

const asideEl = ref<HTMLElement | null>(null);

/** しまったときに残すつまみの幅 */
const TUCKED_WIDTH = 44;

/**
 * 開いたときの幅（px）。
 *
 * 比率（`w-1/3`）にすると行の幅に比例して、左のナビを畳んだときにコメント欄まで広がる。
 * 要件は「左を畳んで空いた幅は本文だけが取る」なので、初回に測った px で固定する。
 * 測るのは「行の幅 − 16px（列の間）の 1/3」。測るまで（SSR と hydration の間）は同じ式の
 * `calc()` を当てておき、測った瞬間に見た目が動かないようにする。
 */
const openWidth = ref<number | null>(null);

/**
 * 左のナビの畳みは `workspace.vue` が cookie（`spec-workflow-sidebar-collapsed`）に持つ。
 * ここではその値で**測ってよい瞬間かどうか**だけを見る。左の開閉に合わせてコメント欄を
 * 動かす（連動する）コードは持たない。
 */
function sidebarCollapsed(): boolean {
  return /(?:^|;\s*)spec-workflow-sidebar-collapsed=true(?:;|$)/.test(document.cookie);
}

/** `main.css` の `.sb-sidebar`（256px）と `.sb-sidebar-collapsed`（64px）の差 */
const SIDEBAR_DIFFERENCE = 256 - 64;

/**
 * 開いたときの幅を測って固定する。
 *
 * 左のナビが開いているときの行の幅を基準にする。畳んだ状態で開いたページでは行が
 * その分だけ広いので、差を引いてから 1/3 を取る（同じ画面で左を開いたときと同じ幅になる）。
 */
function measureOpenWidth(): void {
  const row = asideEl.value?.parentElement;
  if (!row) return;

  const rowWidth = row.getBoundingClientRect().width - (sidebarCollapsed() ? SIDEBAR_DIFFERENCE : 0);
  const width = Math.round((rowWidth - 16) / 3);
  if (width > TUCKED_WIDTH) openWidth.value = width;
}

onMounted(measureOpenWidth);

/**
 * ウィンドウの幅が変わったら測り直す。ただし**左が開いていて一覧が出ているときだけ**。
 * 左を畳んだ最中の resize で測ると、左の畳みがコメント欄の幅に伝わってしまう。
 */
useEventListener('resize', () => {
  if (!tucked.value && !sidebarCollapsed()) measureOpenWidth();
});

/*
 * コメント欄そのものを掴んで左右へ引く。
 *
 * 掴む所を1箇所に絞らない。パネルのどこを掴んでも幅が指に追従し、放した位置で
 * 開くかしまうかが決まる。開いているときは中のボタンや入力の上からは掴まない
 * （押せなくなるため）。6px 動かして初めてドラッグと判定し、動かさずに放したときは
 * 何もしない＝ただのクリックを潰さない。
 */
const dragging = ref(false);
const dragWidth = ref<number | null>(null);

/** この幅より動かして初めて「掴んだ」とみなす。クリックと区別する */
const DRAG_SLOP = 6;

let startX = 0;
let baseWidth = 0;
let moved = false;

/**
 * ドラッグの直後に来る click を捨てる。
 *
 * 放した先がつまみやレールの上だと、pointerup の直後に click が届いて、ドラッグで
 * 決めた開閉がもう一度ひっくり返る。click は pointerup と同じ入力処理の中で届くので、
 * 次のタスク（`setTimeout(0)`）までに来た click だけを捨てれば足りる。
 */
let swallowClick = false;

useEventListener(
  'click',
  (event: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.stopPropagation();
    event.preventDefault();
  },
  { capture: true },
);

function widthWhenOpen(): number {
  if (openWidth.value !== null) return openWidth.value;
  const row = asideEl.value?.parentElement;
  return row ? Math.round((row.getBoundingClientRect().width - 16) / 3) : TUCKED_WIDTH;
}

function onDragMove(event: PointerEvent): void {
  const dx = event.clientX - startX;
  if (Math.abs(dx) > DRAG_SLOP) moved = true;
  if (!moved) return;
  dragWidth.value = Math.min(widthWhenOpen(), Math.max(TUCKED_WIDTH, baseWidth - dx));
}

function onDragEnd(): void {
  window.removeEventListener('pointermove', onDragMove);
  const width = dragWidth.value;
  dragging.value = false;
  dragWidth.value = null;
  if (!moved || width === null) return;
  // 放した位置が開いた幅の半分より狭ければしまう
  tucked.value = width < widthWhenOpen() / 2;
  swallowClick = true;
  setTimeout(() => {
    swallowClick = false;
  }, 0);
}

function onDragStart(event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (!tucked.value && target?.closest('button, a, textarea, input, select')) return;
  const el = asideEl.value;
  if (!el) return;

  startX = event.clientX;
  baseWidth = el.getBoundingClientRect().width;
  moved = false;
  dragging.value = true;

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd, { once: true });
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
      'コメントが1件もありません。本文を選んでコメントを付けるか、「全体へのコメント」を足してから差し戻してください。';
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
      面の切替。本家は面を1つの枠に収めた segmented control で出す。選んでいるものだけを
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
      本文とコメント欄の2列。`grid-cols-3`（1:2 の比率）にしない。比率は行の幅に比例するので、
      左のナビを畳むとコメント欄まで広がる。コメント欄は px で固定し、本文だけが残りを取る
      （design 決定2）。本文に固定幅は与えない。
    -->
    <div class="flex gap-4">
      <div class="min-w-0 flex-1" data-testid="approval-main">
        <!--
          プレビュー: 整形された本文。ここからも指摘を付けられる。

          中身は呼ぶ側が決める（承認画面は読むだけの整形をここに置く）。注釈の面はその上に
          載せるだけで、位置の口は `previewPort` で受け、図に生テキストを添えたい範囲
          （`sourceShown`）はスロットの props で呼ぶ側へ返す。
          面を切り替えても外さない: 外すと描いた本文（図など）が描き直しになる
        -->
        <div v-show="mode === 'preview'">
          <AnnotateSource
            ref="previewAnnotator"
            v-slot="{ sourceShown }"
            :source="source"
            :comments="comments"
            :port="previewPort"
            @select="onSelect"
            @click-mark="editComment"
          >
            <!-- 本文の枠は呼ぶ側が持つ -->
            <slot name="preview" :source-shown="sourceShown" />
          </AnnotateSource>
        </div>

        <!--
          生テキスト: 書いてある通りの字（`MarkdownSource`）。こちらでも同じ注釈が出て、
          同じように付けられる。

          本家（`ApprovalsAnnotator`）は本文の列をまるごと1つの枠に入れ、その中に沈んだ面
          （surface-inset）の箱を置く。操作の帯とデータの領域を切っているのはこの外側の枠で、
          どの面に切り替えても枠は変わらない。
        -->
        <div v-if="mode === 'annotate'" class="sb-panel" data-testid="approval-body">
          <AnnotateSource
            ref="sourceAnnotator"
            :source="source"
            :comments="comments"
            :port="sourceSurface"
            class="rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-inset)]"
            data-testid="approval-annotate-source"
            @select="onSelect"
            @click-mark="editComment"
          >
            <MarkdownSource ref="sourceSurface" :value="source" />
          </AnnotateSource>
        </div>
      </div>

      <!--
        指摘の一覧（コメント欄）。どの面でも出す（本家も出したままにする）。

        しまえる。要素を入れ替えず、この1枚の幅だけを変える（`transition: width`）。
        しまっても幅を 0 にせず 44px のつまみを残し、そこから戻す。
        開閉の口は4つ（design 決定3）:
          1. コメント欄そのものを掴んで左右へ引く（`pointerdown`）
          2. 見出し帯のボタン（`approval-comments-tuck`）
          3. しまった帯のクリック（`approval-comments-handle`）
          4. 右辺に沿った全高の不可視のレール（`approval-comments-toggle`）
      -->
      <aside
        ref="asideEl"
        class="relative flex min-w-0 shrink-0 select-none flex-col rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-panel)]"
        :class="[
          tucked ? 'w-11' : openWidth === null ? 'w-[calc((100%-16px)/3)]' : '',
          dragging
            ? 'cursor-grabbing overflow-hidden'
            : 'cursor-grab transition-[width] duration-300 ease-out',
        ]"
        :style="
          dragWidth !== null
            ? { width: `${dragWidth}px` }
            : !tucked && openWidth !== null
              ? { width: `${openWidth}px` }
              : undefined
        "
        data-testid="approval-comments"
        :data-tucked="tucked"
        @pointerdown="onDragStart"
      >
        <!--
          右辺に沿った全高のレール。**背景も線も持たず、hover / active でも色を付けない**
          （ユーザー指示 2026-09-01）。押せるだけ。どの高さでも目の前に在るので、縦に長い
          本文をスクロールしていても口を探しに戻らなくてよい。
        -->
        <button
          type="button"
          class="absolute inset-y-0 right-0 z-20 w-5 cursor-pointer"
          :aria-label="tucked ? 'コメントの一覧を出す' : 'コメントの一覧をしまう'"
          :title="tucked ? 'コメントの一覧を出す' : 'コメントの一覧をしまう'"
          data-testid="approval-comments-toggle"
          @click="tucked = !tucked"
        />

        <!--
          しまったときに残すつまみ。帯のどこを押しても戻る。

          何を残すかは3案あり（ui.md: a 縦書きの帯 / b 同じ場所のつまみ / c 細い見出し）、
          採用はまだ ui.md「Chosen」に記録されていない。**a を仮置き**している（design 決定4）。
        -->
        <button
          v-if="tucked"
          type="button"
          class="flex h-full w-full cursor-pointer flex-col items-center rounded-[var(--radius-lg)] bg-[var(--surface-inset)] py-4 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="コメントの一覧を出す"
          title="コメントの一覧を出す"
          data-testid="approval-comments-handle"
          @click="tucked = false"
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
              しまうボタン。左のナビの `sidebar-collapse` と同じ作り（32px 四方・chevron）で、
              帯の中の右端に置く。右辺のレールは補助で、目に見える口はこちら。
            -->
            <button
              type="button"
              class="ml-auto flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-lg)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] active:bg-[var(--accent-primary)] active:text-white"
              aria-label="コメントの一覧をしまう"
              title="コメントの一覧をしまう"
              data-testid="approval-comments-tuck"
              @click="tucked = true"
            >
              <UIcon name="upstream:chevron-double-left" class="block size-5 rotate-180" />
            </button>
          </h4>

          <!--
            本家のこのボタンは `.btn` ではなく
            `w-full px-3 py-2 bg-[var(--accent-primary)] text-white rounded-lg text-xs sm:text-sm`。
            実測 12px / 400 / padding 8px 12px / 角丸 8px / 枠なし。`.sb-action` は
            角丸 6px・600 相当なので、ここだけ本家の指定をそのまま持つ。
            どの面でも出す（付けられない面が無いので、切り替えを促す断り書きは無い）。
          -->
          <button
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
            <CommentCard :comment="c" @edit="editComment" @remove="deleteId = $event" @locate="locate" />
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
