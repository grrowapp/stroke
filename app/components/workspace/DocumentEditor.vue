<script setup lang="ts">
/**
 * 文書を直して保存する。仕様書とステアリングの本文がこれを使う。
 *
 * 承認対象の本文は読むだけなので、承認画面はこれを使わず `DocumentView` を使う。
 * 読み取り専用のものにモードを足すと「編集できるが編集させない」状態を持つことになり、
 * 間違って有効になる余地が残る。編集できないものは編集の口を持たない、という形を
 * コンポーネントの境界で表している（specs/document-editing）。
 *
 * 扱うのは markdown のテキストそのもの。読み込みと保存のあいだで変換を挟まないので、
 * 開いて保存しただけで内容が変わることが構造的に起こらない（design.md の決定）。
 * WYSIWYG を採らなかった理由は `markdown-roundtrip.test.ts` に残してある。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from '#imports';
import { onBeforeRouteLeave } from 'vue-router';

import DocumentView from '~/components/workspace/DocumentView.vue';

const props = defineProps<{
  /** 保存されている内容。null は未作成 */
  content: string | null | undefined;
  /** 保存する。失敗した理由を返す。成功なら null */
  save: (content: string) => Promise<string | null>;
  /** 本家に繋がっていないと保存できない */
  canSave?: boolean;
  /**
   * 開いた時点で編集に入る。
   *
   * 承認の対象文書はこれを立てる。承認から来た人は読んで直すために来ており、
   * そこで「編集」を1回押させる理由が無い（specs/document-editing）。
   */
  editOnOpen?: boolean;
  testid?: string;
}>();

type Mode = 'read' | 'edit';

const mode = ref<Mode>(props.editOnOpen === true ? 'edit' : 'read');

/** 保存されている内容。保存が終わったらここを更新する */
const saved = ref(props.content ?? '');
/** 編集中の内容 */
const draft = ref(props.content ?? '');

const saving = ref(false);
const justSaved = ref(false);
const error = ref<string | null>(null);

let savedNotice: ReturnType<typeof setTimeout> | null = null;

/**
 * 変更の有無は、保存されている内容との比較で決める。編集操作をしたかどうかではない。
 * 直して元に戻した場合に引き止めないため（specs/document-editing）。
 */
const dirty = computed(() => draft.value !== saved.value);

/** 未作成の文書は編集させない。作る操作は持たない */
const editable = computed(() => props.content !== null && props.content !== undefined);

/**
 * 接続状態はブラウザに渡ってからでないと分からない。`useBoardSocket` は SSR で
 * 接続しないため、サーバー側では常に「未接続」になる。
 *
 * それをそのまま出すと「保存できません」が一瞬出てから消える（hydration mismatch）。
 * 繋がっているかどうかが確定するまでは、その表示を出さない。
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const cannotSave = computed(() => mounted.value && props.canSave === false);

const savable = computed(() => dirty.value && !saving.value && !cannotSave.value);

// 別の文書へ移ったときに前の内容を引きずらない
watch(
  () => props.content,
  (next) => {
    saved.value = next ?? '';
    draft.value = next ?? '';
    mode.value = props.editOnOpen === true && next !== null && next !== undefined ? 'edit' : 'read';
    error.value = null;
    clearSavedNotice();
  },
);

function clearSavedNotice(): void {
  justSaved.value = false;
  if (savedNotice !== null) {
    clearTimeout(savedNotice);
    savedNotice = null;
  }
}

function startEditing(): void {
  mode.value = 'edit';
  error.value = null;
}

/** 直しかけを捨てて読みに戻る */
function discard(): void {
  draft.value = saved.value;
  mode.value = 'read';
  error.value = null;
}

async function submit(): Promise<void> {
  if (!savable.value) return;

  saving.value = true;
  error.value = null;
  clearSavedNotice();

  const failure = await props.save(draft.value);

  saving.value = false;

  if (failure !== null) {
    // 失敗しても直しかけは捨てない。捨てると書いたものが消える
    error.value = failure;
    return;
  }

  saved.value = draft.value;
  justSaved.value = true;
  savedNotice = setTimeout(() => {
    justSaved.value = false;
    savedNotice = null;
  }, 3000);
}

// --- 直しかけのまま離れようとしたら引き止める ---

function warnOnUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  // 文言はブラウザが決める。preventDefault だけが効く
  event.preventDefault();
}

onMounted(() => window.addEventListener('beforeunload', warnOnUnload));

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnOnUnload);
  clearSavedNotice();
});

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('保存していない変更があります。破棄して移動しますか？');
});
</script>

<template>
  <div :data-testid="testid" :data-dirty="dirty">
    <div class="mb-4 flex items-center gap-2">
      <template v-if="mode === 'read'">
        <button
          v-if="editable"
          type="button"
          class="sb-btn"
          data-testid="document-edit"
          @click="startEditing"
        >
          編集
        </button>
      </template>

      <template v-else>
        <button
          type="button"
          class="sb-btn sb-btn-primary"
          :disabled="!savable"
          data-testid="document-save"
          @click="submit"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button type="button" class="sb-btn" data-testid="document-cancel" @click="discard">
          やめる
        </button>
      </template>

      <span v-if="justSaved" class="sb-chip sb-chip-on" data-testid="document-saved">
        保存しました
      </span>
      <span v-if="dirty" class="sb-chip" data-testid="document-unsaved">未保存</span>
      <span v-if="cannotSave" class="sb-chip" data-testid="document-cannot-save">
        本家に繋がっていないため保存できません
      </span>
    </div>

    <p v-if="error !== null" class="sb-error" data-testid="document-save-error">
      {{ error }}
    </p>

    <!--
      編集中は markdown の生テキストを出す。読みのときは既存の描画を通す。
      同じ文字列が行き来するだけで、変換は挟まない
    -->
    <textarea
      v-if="mode === 'edit'"
      v-model="draft"
      class="sb-textarea"
      spellcheck="false"
      data-testid="document-input"
    />
    <DocumentView v-else :content="content" />
  </div>
</template>
