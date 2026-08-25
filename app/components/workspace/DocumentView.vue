<script setup lang="ts">
/**
 * 文書の本文を出す。仕様書・ステアリング・承認対象のいずれもこれを使う。
 *
 * 読むだけ。編集も承認も置かない（specs/project-workspace）。
 *
 * 本家は文書を markdown として描いている（`MDXEditorWrapper` 経由）。生テキストのまま
 * 出すと、見出しも表もコードブロックも潰れて本家と別物になるので、ここで markdown を
 * 解釈する。使うのは `@nuxtjs/mdc` の `<MDC>`。生 HTML・`on*` 属性・危険スキームは
 * parse 時に落ちるので、この画面で安全策を持たない。
 *
 * **本文の型は Tailwind Typography（`prose`）が持つ。**
 *
 * 本家の `theme.css` には `.markdown-content` という本文用の規則があるが、本家の
 * どの `.tsx` もそのクラスを名乗っていない（`grep -rn "markdown-content" src` の
 * ヒットは `theme.css` だけ）。**使われていない CSS** である。本家が実際に本文へ
 * 当てているのは `MDXEditorWrapper.tsx` の `contentEditableClassName`、つまり
 * 下の class 列そのもの。ここは本家の並びを1文字も変えずに写している。
 *
 * 数値を書き写すのではなく同じプラグインへ委ねているのは、本家との一致を「転記の
 * 正確さ」ではなく「同じ生成物であること」で担保するため。`.markdown-content` を
 * 写して起きたずれ（h1 が 36px ではなく 16px になっていた等）を繰り返さない。
 */
import EmptyState from '~/components/workspace/EmptyState.vue';

const props = withDefaults(
  defineProps<{ content: string | null | undefined; missing?: string }>(),
  { missing: 'この文書はまだ作られていません。' },
);
</script>

<template>
  <!--
    `prose …` は本家 `MDXEditorWrapper.tsx` の `contentEditableClassName` の写し（並びも同じ）。
    `sb-markdown` は本家の MDXEditor 由来の差分（表・インラインコード・面）を載せる掛かり、
    `document-content` は E2E の掴み所。
  -->
  <div
    v-if="props.content"
    class="sb-markdown prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-img:max-w-full prose-img:h-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-pre:bg-gray-50 dark:prose-pre:bg-gray-900 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300"
    data-testid="document-content"
  >
    <MDC :value="props.content" />
  </div>
  <EmptyState v-else testid="document-missing" title="中身がありません">
    {{ props.missing }}
  </EmptyState>
</template>
