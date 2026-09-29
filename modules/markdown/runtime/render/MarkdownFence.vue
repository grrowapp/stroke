<script setup lang="ts">
/**
 * markdown のコードブロック（`pre`）の受け口。振り分けだけを持つ。
 *
 * `nuxt.config.ts` の `mdc.components.map` で `pre` をこれに差し替えている。MDC は
 * コードブロックを `<pre language="…" code="(生ソース全文)">` として渡してくるので、
 * `language` が mermaid のものは図（`MermaidDiagram`）へ、それ以外は `@nuxt/ui` の
 * `ProsePre` へ回す。
 *
 * props を宣言せず `$attrs` で受けているのは、宣言すると属性として出なくなり、
 * 受け側（`ProsePre`）に shiki のクラスやハイライトの指定が届かなくなるため。
 *
 * **フェンスの生テキストの範囲もここで受ける。** 図に生テキストを添えるかどうかの判断に要る
 * （`./source-shown.ts`）。これも属性で届くので、同じ `$attrs` から読む。
 *
 * **名前で引かれるので global に登録する。** MDC は map の値を `resolveComponent(名前)` で
 * 引く（`MDCRenderer.vue`）。名前が解けないと `<MarkdownPre>` という未知の要素がそのまま
 * 出る（実測）。以前は `app/components/global/` に置くことでこれを満たしていたが、
 * モジュールの `addComponent({ global: true })` が同じ登録を行うため、置き場の制約は無い。
 * 振り分けた先はここから相対で import する。
 *
 * ## コードブロック
 *
 * 本家（spec-workflow-mcp）はコードブロックを MDXEditor の `codeMirrorPlugin` に渡していて、
 * `pre` を使わず `div._codeMirrorWrapper_` > `div._codeMirrorToolbar_` + `.cm-editor` になる。
 * stroke-board は読み取り表示なので CodeMirror は持ち込まず、**本家の DOM が画面に出す形**
 * （枠・右上の帯・行番号・折り返し）を `ProsePre` の上に載せる。枠・行番号・折り返しは
 * `ui.prose.pre`（`modules/markdown/index.ts` の `PROSE_THEME`）が持つ。
 *
 * 本家の右上の帯には `button[role=combobox][aria-label="Language"]` と「Delete code block」が
 * 並ぶが、文書表示（`/specs/view`）ではどちらも `disabled` で押せない。操作としては存在しない
 * ので、ここは同じ位置・同じ面に**言語名の札**だけを出す。
 *
 * **札は `ProsePre` の外に置く。** `ProsePre` の slot は `pre` の中身しか無く、そこへ入れると
 * 札の字が `pre` の字に混ざってフェンスの対応表（`../position/fence.ts`）が組めなくなる。
 * `filename` の header は札と同じ位置に出せず、属性（`data-testid`）も付けられない。
 *
 * **`copy` は切る。** 写すボタンは今の画面に無い操作で（ADR 0025）、足すにはユーザーの
 * 指示が要る。`filename` も渡さない。渡すと `ProsePre` が header を足し、今の画面に無い
 * 見た目が増える。
 *
 * **`ProsePre` は `inheritAttrs: false` を持たない。** 渡した属性（位置の印・`data-testid`）は
 * 入れ物の `div` と `pre` の両方に付く（`@nuxt/ui` 4.10.0 の `prose/Pre.vue` で実測）。
 * `pre` だけに付ける経路は無い（`ui` は class だけ、slot は `pre` の中身）ので、位置の口の側が
 * `span` 以外の印を包みとして読まないことで受けている（`../position/preview.ts` の `visit`）。
 *
 * **`language` は `ProsePre` の props に吸われて `pre` の属性に出ない。** どの言語のフェンス
 * かを DOM から引けるよう、同じ値を `data-language` で渡す。
 *
 * 行番号は shiki が行ごとに出す `span.line` に CSS の counter で振る。ただし
 * `@nuxtjs/mdc` の rehype は language が無い（＝ `text`）フェンスを shiki に通さないので
 * （`highlighter/rehype.js`）、その場合は `.line` が無い。通らなかったときはフェンスの
 * 生ソース（`code`）から行を組み立てて、どちらでも行番号が出るようにする。
 */
import { ProsePre } from '#components';
import { computed, useAttrs } from 'vue';

import MarkdownDiagram from './MarkdownDiagram.vue';
import { readFenceRange, useSourceShown } from './source-shown';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();

/** mermaid フェンスなら元ソース、そうでなければ null */
const mermaid = computed<string | null>(() =>
  attrs.language === 'mermaid' && typeof attrs.code === 'string' ? attrs.code : null,
);

/**
 * このフェンスが占める生テキストの範囲。**属性で届かなければ `null`。**
 *
 * 図に生テキストを添えるかどうかは、外から渡された範囲とこの範囲が重なるかで決まる
 * （`./source-shown.ts`）。届かない場合は重なりを判断できないので、添えない側に倒る。
 */
const sourceRange = computed(() => readFenceRange(attrs));

/** 注釈の付いた範囲がこのフェンスに重なるか。重なる図には生テキストを添える */
const sourceShown = useSourceShown(sourceRange);

/**
 * 本家が言語セレクタに並べている名前（`MDXEditorWrapper.tsx` の `codeBlockLanguages`）。
 * ここに無い言語はフェンスに書かれた文字列をそのまま出す。
 */
const LANGUAGE_NAME: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  markdown: 'Markdown',
  md: 'Markdown',
  python: 'Python',
  py: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  sql: 'SQL',
  yaml: 'YAML',
  xml: 'XML',
  text: 'Plain Text',
  '': 'Plain Text',
};

/** フェンスの言語。無指定のフェンスには MDC が `text` を入れる */
const language = computed(() => (typeof attrs.language === 'string' ? attrs.language : ''));

const languageName = computed(() => LANGUAGE_NAME[language.value] ?? language.value);

/**
 * shiki を通ったか。通っていれば `pre` のクラスに `shiki` が入る
 * （`highlighter/shiki.js` が返す className を rehype が足す）。
 */
const highlighted = computed(() =>
  String(attrs.class ?? '')
    .split(/\s+/)
    .includes('shiki'),
);

/** 行。末尾の空白は shiki と同じく落とす（`codeToHast(code.trimEnd())`） */
const lines = computed(() => (typeof attrs.code === 'string' ? attrs.code : '').trimEnd().split('\n'));

/** 行番号の桁数。番号の欄の幅がこれで決まる（本家の CodeMirror も桁で広がる） */
const digits = computed(() => String(lines.value.length).length);
</script>

<template>
  <MarkdownDiagram
    v-if="mermaid !== null"
    :code="mermaid"
    :show-source="sourceShown"
    :source-range="sourceRange"
  />
  <div v-else class="sb-code" data-testid="code-block" :style="{ '--sb-code-digits': digits }">
    <!-- 本家の `_codeMirrorToolbar_`（右上に重なる帯）と同じ位置・同じ面 -->
    <div class="sb-code-toolbar">
      <span class="sb-code-language" data-testid="code-block-language">{{ languageName }}</span>
    </div>
    <ProsePre
      v-bind="attrs"
      :filename="undefined"
      :copy="false"
      :data-language="language"
      data-testid="code-block-body"
    ><slot v-if="highlighted" /><code v-else><span v-for="(text, index) in lines" :key="index" class="line" :line="index + 1">{{ index === lines.length - 1 ? text : `${text}\n` }}</span></code></ProsePre>
  </div>
</template>
