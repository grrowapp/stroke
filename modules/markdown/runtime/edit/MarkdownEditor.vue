<script setup lang="ts">
/**
 * 文書を直して保存する。仕様書とステアリングの本文がこれを使う。
 *
 * 承認対象の本文は読むだけなので、承認画面はこれを使わず `MarkdownView` を使う。
 * 読み取り専用のものにモードを足すと「編集できるが編集させない」状態を持つことになり、
 * 間違って有効になる余地が残る。編集できないものは編集の口を持たない、という形を
 * コンポーネントの境界で表している（specs/document-editing）。
 *
 * 扱うのは markdown のテキストそのもの。読み込みと保存のあいだで変換を挟まないので、
 * 開いて保存しただけで内容が変わることが構造的に起こらない（design.md の決定）。
 * WYSIWYG を採らなかった理由は `docs/specs/reference/mdc-observations.md` に残してある。
 *
 * **保存そのものはここの責務ではない。** `save` を受け取って呼ぶだけで、保存先も
 * 保存の可否も呼ぶ側が決める（`openspec/specs/markdown/module`）。中身が無いときに
 * 何を出すかも同じで、`#empty` を素通しして呼ぶ側へ渡す。
 */
import { useEventListener, useMounted, useTimeoutFn } from '@vueuse/core';
import { computed, ref, watch } from '#imports';
import { onBeforeRouteLeave } from 'vue-router';

import MarkdownView from '../render/MarkdownView.vue';

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
  /**
   * 本文を枠付きの箱（`.sb-panel`）に入れる。
   *
   * 本家は画面によって枠の数が違う。仕様書・ステアリング（`SpecViewerPage`）は本文の
   * パネル1枚だけで、その内側いっぱいに contentEditable の暗い面が入る。一方で承認の
   * 注釈画面（`ApprovalsAnnotator`）は、外側の承認カードの中にもう1枚
   * `bg-panel border rounded-lg` を置き、どの面（プレビュー / 注釈 / 並列表示）でも
   * 同じ枠に本文を入れる。
   *
   * 既定は枠なし。枠が要るのは承認の画面だけなので、そちらが立てる。
   */
  framed?: boolean;
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

/** 編集中に直しかけを整形して見ているか。画面は移らず、下の面だけが入れ替わる */
const preview = ref(false);

/**
 * 「保存しました」を3秒で消す。`start()` は前の待ちを捨ててから張り直す。
 *
 * `stop()` が止めるのは timer だけで、`justSaved` は下がらない。表示を消すのは
 * `clearSavedNotice()` の責務として残す（`stop()` に置き換えると、保存の3秒以内に
 * 別の文書へ切り替えたときチップが残る）。
 */
const savedNotice = useTimeoutFn(
  () => {
    justSaved.value = false;
  },
  3000,
  { immediate: false },
);

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
const mounted = useMounted();

const cannotSave = computed(() => mounted.value && props.canSave === false);

const savable = computed(() => dirty.value && !saving.value && !cannotSave.value);

// 別の文書へ移ったときに前の内容を引きずらない
watch(
  () => props.content,
  (next) => {
    saved.value = next ?? '';
    draft.value = next ?? '';
    mode.value = props.editOnOpen === true && next !== null && next !== undefined ? 'edit' : 'read';
    preview.value = false;
    error.value = null;
    clearSavedNotice();
  },
);

function clearSavedNotice(): void {
  justSaved.value = false;
  savedNotice.stop();
}

function startEditing(): void {
  mode.value = 'edit';
  error.value = null;
}

/** 直しかけを捨てて読みに戻る */
function discard(): void {
  draft.value = saved.value;
  mode.value = 'read';
  preview.value = false;
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
  savedNotice.start();
}

// --- 直しかけのまま離れようとしたら引き止める ---

function warnOnUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  // 文言はブラウザが決める。preventDefault だけが効く
  event.preventDefault();
}

// 対象を渡さないと window。SSR では何もしない。解除は scope の破棄に任せる
useEventListener('beforeunload', warnOnUnload);

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm('保存していない変更があります。破棄して移動しますか？');
});
</script>

<template>
  <div :data-testid="testid" :data-dirty="dirty">
    <div class="mb-4 flex items-center gap-2">
      <template v-if="mode === 'read'">
        <!--
          下層のボタンは `.sb-action`（本家の `.btn`）。prototype 由来の `.sb-btn` は
          上層のもので、寸法（padding 7px / 600）が本家と違う（main.css の注釈）。
        -->
        <button
          v-if="editable"
          type="button"
          class="sb-action"
          data-testid="document-edit"
          @click="startEditing"
        >
          編集
        </button>
      </template>

      <template v-else>
        <!--
          直しかけを整形して見る。画面は移らず、この場で下の面が切り替わる。
          本家の承認画面もプレビューと生テキストを同じ場で行き来する
        -->
        <button
          type="button"
          class="sb-action"
          :class="preview ? '' : 'sb-action-secondary'"
          :aria-pressed="preview"
          data-testid="document-preview"
          @click="preview = !preview"
        >
          プレビュー
        </button>
        <button
          type="button"
          class="sb-action"
          :disabled="!savable"
          data-testid="document-save"
          @click="submit"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button
          type="button"
          class="sb-action sb-action-secondary"
          data-testid="document-cancel"
          @click="discard"
        >
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
      本文の箱。既定では枠を持たない（`framed` の説明を見ること）。

      本家（`SpecViewerPage`）は本文を `.panel p-4` 1枚だけで囲み、その内側いっぱいに
      contentEditable の暗い面（#111827）を敷く。パネルは1枚で、暗い矩形がそのまま
      本文の領域を示す（実測: パネル x=280 w=1136 → 暗い面 x=297 w=1102 → 本文 x=309 w=1078）。

      ここに `.sb-panel` を常に置いていたときは枠と余白が二重になり、本文の欄が本家より
      34px 狭く・17px 内側にずれていた（実測）。

      編集中は markdown の生テキストを出す。読みのときは既存の描画を通す。
      同じ文字列が行き来するだけで、変換は挟まない。

      プレビューは**直しかけ（draft）**を描く。保存済みの内容ではないので、
      書いたものがどう出るかをその場で確かめられる。
    -->
    <div :class="framed === true ? 'sb-panel' : ''" data-testid="document-body">
      <MarkdownView v-if="mode === 'edit' && preview" :value="draft">
        <template #empty><slot name="empty" /></template>
      </MarkdownView>
      <textarea
        v-else-if="mode === 'edit'"
        v-model="draft"
        class="sb-textarea"
        spellcheck="false"
        data-testid="document-input"
      />
      <MarkdownView v-else :value="content">
        <template #empty><slot name="empty" /></template>
      </MarkdownView>
    </div>
  </div>
</template>
