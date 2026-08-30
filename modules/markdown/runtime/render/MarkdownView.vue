<script setup lang="ts">
/**
 * markdown の本文を整形して描くコンポーネント。仕様書・ステアリング・承認対象の
 * いずれもこれを使う。
 *
 * 読むだけ。編集も承認も置かない。
 *
 * **位置の対応を `defineExpose` で公開する。** 生テキストの面（`MarkdownSource`）と
 * 同じ形で出すので、使う側はどちらの面に載っているかで分岐しない
 * （`openspec/specs/markdown/module`）。下の `toSourceRange` / `toDomRange` を見ること。
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
 * 解釈する。生 HTML・`on*` 属性・危険スキームは parse 時に落ちるので、ここで安全策を
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
import { MDCRenderer } from '#components';
import { useTemplateRef } from '#imports';
import { provide } from 'vue';

import { createPreviewPositionPort } from '../position/preview';
import { markSourcePosition } from '../position/source-span';
import { SOURCE_SHOWN_KEY } from './source-shown';

import type { PositionPort, SourceRange } from '../position/types';

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
    /**
     * 図のもとになった生テキストを添えたい範囲。
     *
     * **モジュールは注釈を知らない。** 注釈が付いているかどうかではなく、
     * 「ソースを見せたい生テキストの範囲」として受け取る。注釈を持つ側が、注釈の
     * 付いている範囲を渡す。モジュールはそれが図のフェンスと重なるかだけを見る
     * （`openspec/specs/markdown/module`）。
     */
    sourceShown?: readonly SourceRange[];
  }>(),
  { testid: 'document-content', surface: true, sourceShown: () => [] },
);

/**
 * 図の差し替え先（`MarkdownFence` → `MarkdownDiagram`）へ降ろす。
 *
 * **props では届かない。** MDC は `components.map` の値を `resolveComponent` で引いて
 * `MarkdownFence` を自分で作るので、本文の器から props を渡す経路が無い。
 */
provide(SOURCE_SHOWN_KEY, () => props.sourceShown);

const root = useTemplateRef<HTMLElement>('root');

/**
 * 位置の対応。
 *
 * **`MarkdownSource` と同じ形で出す**（あちらの `defineExpose` を見ること）。面の実体
 * （ここでは器の要素）を外へ渡さず、`PositionPort` をそのまま名乗る。出し方が面ごとに
 * 分かれると、使う側が面を分岐することになる（`openspec/specs/markdown/module`）。
 *
 * **呼ばれるたびに作る。** 保持しない。`props.value` が同じでも DOM は変わりうる
 * （`<MDC>` の解析完了、図の描画完了）ので、無効化の条件を正しく書けない。
 * 走査のやり直しは `preview.ts` が織り込み済みである。
 *
 * 中身が無いときは器そのものが描かれないので、どちらの向きも `null` になる。
 * `<MDC>` の解析が終わる前も器の中は空で、両方向とも `null` が返る（実測）。
 */
function port(): PositionPort | null {
  const container = root.value;
  if (!container) return null;
  return createPreviewPositionPort({ container, source: props.value ?? '' });
}

function toSourceRange(range: Range): SourceRange | null {
  return port()?.toSourceRange(range) ?? null;
}

function toDomRange(source: SourceRange): Range | null {
  return port()?.toDomRange(source) ?? null;
}

defineExpose({ toSourceRange, toDomRange } satisfies PositionPort);
</script>

<template>
  <!--
    `prose …` は本家 `MDXEditorWrapper.tsx` の `contentEditableClassName` の写し（並びも同じ）。
    `sb-markdown` は本家の MDXEditor 由来の差分（表・インラインコード・面）を載せる掛かり、
    `document-content` は E2E の掴み所。
  -->
  <div
    v-if="props.value"
    ref="root"
    v-bind="$attrs"
    class="prose prose-sm sm:prose-base max-w-none dark:prose-invert prose-img:max-w-full prose-img:h-auto prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white prose-code:text-gray-800 dark:prose-code:text-gray-200 prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-pre:bg-gray-50 dark:prose-pre:bg-gray-900 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300"
    :class="props.surface ? 'sb-markdown' : ''"
    :data-testid="props.testid"
  >
    <!--
      `keepPosition` は解析の設定なので `parser-options` で渡す。module の設定
      （`ModuleOptions`）には無い（`dist/module.d.mts` の 63行目が `MDCParseOptions`、
      126行目が `ModuleOptions`。module 側に書くと TS2353 で落ちる）。

      これで AST の各ノードに生テキストの文字オフセットが乗り、位置の対応が成り立つ
      （`openspec/specs/markdown/module`）。

      **ただし `<MDC>` に描かせきると位置は DOM に出ない。** `<MDC>` の既定の中身は
      `MDCRenderer` を呼ぶだけで、`MDCRenderer` は text ノードを `h(Text, node.value)` で
      描いて position を捨てる（`@nuxtjs/mdc/dist/runtime/components/MDCRenderer.vue:136`。
      割り込む余地は無い）。位置の対応（`../position/types.ts`）は DOM から位置を引くものなので
      それでは成り立たない。

      そこで**既定の中身だけを差し替える**。解析（`parseMarkdown` の呼び出し・
      `useAsyncData` による payload の受け渡し・待つ位置）は `<MDC>` に残したまま、
      渡ってきた AST を `markSourcePosition` に通してから同じ `MDCRenderer` へ送る。
      `tag` と `class` は `<MDC>` が既定で `MDCRenderer` に渡している値をそのまま置く。

      **自前で `parseMarkdown` を呼び直す形にはしない。** 一度そう書いたところ、
      client 側で解析がもう一度走って SSR と shiki の色が食い違い、hydration mismatch に
      なった（Vue が全体を描き直し、アイコンが消えた。実測）。解析の段は触らないこと。
    -->
    <MDC :value="props.value" :parser-options="{ keepPosition: true }">
      <template #default="{ body, data }">
        <MDCRenderer
          v-if="body"
          tag="div"
          :class="''"
          :body="markSourcePosition(body)"
          :data="data"
          :unwrap="false"
        />
      </template>
    </MDC>
  </div>
  <slot v-else name="empty" />
</template>
