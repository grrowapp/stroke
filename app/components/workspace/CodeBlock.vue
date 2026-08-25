<script setup lang="ts">
/**
 * markdown のコードブロック。mermaid 以外のフェンスをここで描く。
 *
 * 本家（spec-workflow-mcp）はコードブロックを MDXEditor の `codeMirrorPlugin` に渡していて、
 * `pre` を使わず `div._codeMirrorWrapper_` > `div._codeMirrorToolbar_` + `.cm-editor` になる。
 * stroke-board は読み取り表示なので CodeMirror は持ち込まず、**本家の DOM が画面に出す形**
 * （枠・右上の帯・行番号・折り返し）を素の `pre` で組み立てる。
 *
 * 本家の右上の帯には `button[role=combobox][aria-label="Language"]` と「Delete code block」が
 * 並ぶが、文書表示（`/specs/view`）ではどちらも `disabled` で押せない。操作としては存在しない
 * ので、ここは同じ位置・同じ面に**言語名の札**だけを出す。
 *
 * 行番号は shiki が行ごとに出す `span.line` に CSS の counter で振る。ただし
 * `@nuxtjs/mdc` の rehype は language が無い（＝ `text`）フェンスを shiki に通さないので
 * （`highlighter/rehype.js`）、その場合は `.line` が無い。通らなかったときはフェンスの
 * 生ソース（`code`）から行を組み立てて、どちらでも行番号が出るようにする。
 */
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** フェンスの言語。無指定のフェンスには MDC が `text` を入れる */
  language?: string;
  /** フェンスの生ソース。shiki を通らなかったときに行へ割るのに使う */
  code?: string;
}>();

const attrs = useAttrs();

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

const languageName = computed(() => LANGUAGE_NAME[props.language ?? ''] ?? props.language);

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
const lines = computed(() => (props.code ?? '').trimEnd().split('\n'));

/** 行番号の桁数。番号の欄の幅がこれで決まる（本家の CodeMirror も桁で広がる） */
const digits = computed(() => String(lines.value.length).length);
</script>

<template>
  <div class="sb-code" data-testid="code-block" :style="{ '--sb-code-digits': digits }">
    <!-- 本家の `_codeMirrorToolbar_`（右上に重なる帯）と同じ位置・同じ面 -->
    <div class="sb-code-toolbar">
      <span class="sb-code-language" data-testid="code-block-language">{{ languageName }}</span>
    </div>
    <pre
      class="sb-code-body"
      v-bind="attrs"
      :language="props.language"
      data-testid="code-block-body"
    ><slot v-if="highlighted" /><code v-else><span v-for="(text, index) in lines" :key="index" class="line" :line="index + 1">{{ index === lines.length - 1 ? text : `${text}\n` }}</span></code></pre>
  </div>
</template>
