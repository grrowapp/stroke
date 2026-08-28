<script setup lang="ts">
/**
 * markdown の本文を出す口。仕様書・ステアリング・承認対象のいずれもこれを使う。
 *
 * 読むだけ。編集も承認も置かない。
 *
 * **中身が無いときに何を出すかは、ここでは決めない。** 「この文書はまだ作られていません」は
 * 文書が未作成かどうかの話（`openspec/specs/document-editing`）で、markdown を描く話では
 * ない。出すものは `#empty` に呼ぶ側が渡す。ここで決めると、モジュールが app 側の部品
 * （`EmptyState` = @nuxt/ui の `UEmpty`）を参照することになり、境界が壊れる。
 *
 * 「中身が無い」の判定だけはここが持つ。呼ぶ側ごとに `v-if` を書くと判定がばらけるため。
 *
 * 本家は文書を markdown として描いている（`MDXEditorWrapper` 経由）。生テキストのまま
 * 出すと、見出しも表もコードブロックも潰れて本家と別物になるので、ここで markdown を
 * 解釈する。生 HTML・`on*` 属性・危険スキームは parse 時に落ちるので、この口で安全策を
 * 持たない（設定は `modules/markdown/index.ts`）。
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
/**
 * `class` は呼ぶ側から足せる（余白など、置かれる場所の都合）。本文の型そのものは
 * ここが持ち、呼ぶ側で差し替えさせない。
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    value: string | null | undefined;
    /** E2E の掴み所。同じ画面に2つ置く場合に呼ぶ側が分ける */
    testid?: string;
    /**
     * 本家写しの面（`.sb-markdown`）に載せる。
     *
     * **型（prose）と面（置かれ方）は別物である。** 型はどこで出しても同じでなければ
     * ならないのでここが持つが、面は画面の作りに従う。本家写しの画面（仕様書・
     * ステアリング・承認）は一段暗い矩形の中に本文を置くのでこれを立てる。
     * ストロークの画面は自前の余白を持つ別レイアウトなので寝かせる。立てると
     * 枠と余白が二重になる。
     */
    surface?: boolean;
  }>(),
  { testid: 'document-content', surface: true },
);
</script>

<template>
  <!--
    `prose …` は本家 `MDXEditorWrapper.tsx` の `contentEditableClassName` の写し（並びも同じ）。
    `sb-markdown` は本家の MDXEditor 由来の差分（表・インラインコード・面）を載せる掛かり、
    `document-content` は E2E の掴み所。
  -->
  <div
    v-if="props.value"
    v-bind="$attrs"
    class="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-img:max-w-full prose-img:h-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-pre:bg-gray-50 dark:prose-pre:bg-gray-900 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300"
    :class="props.surface ? 'sb-markdown' : ''"
    :data-testid="props.testid"
  >
    <MDC :value="props.value" />
  </div>
  <slot v-else name="empty" />
</template>
