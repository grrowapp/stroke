<script setup lang="ts">
/**
 * markdown の生テキストをそのまま出す面。整形せず、書いてある通りの字を並べる。
 *
 * 読むだけ。編集も承認も置かない。
 *
 * **注釈のことを知らない。** ハイライトも重なりの下線も扱わない。この面がするのは
 * 「生テキストを出す」ことと「位置の口を出す」ことの2つだけで、その上に何を塗るかは
 * 注釈の側が位置の口を通して決める（`../position/types.ts`）。面ごとに注釈の実装を
 * 持たないための形なので、ここに塗りを足さないこと。
 *
 * **中身が無いときに何を出すかは、ここでは決めない。** `MarkdownView` と同じで、出すものは
 * `#empty` に呼ぶ側が渡す。ここで決めるとモジュールが app 側の部品を参照することになる。
 *
 * 整形された本文の面は `MarkdownView`。どちらの面も位置の口を同じ形で出すので、注釈の側は
 * どちらに載っているかで分岐しない。
 */
import { useTemplateRef } from '#imports';

import { createPlainPositionPort } from '../position/plain';
import type { PositionPort, SourceRange } from '../position/types';

/**
 * `class` は呼ぶ側から足せる（余白など、置かれる場所の都合）。字そのものは
 * ここが持ち、呼ぶ側で差し替えさせない。
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    value: string | null | undefined;
    /** E2E の掴み所。同じ画面に2つ置く場合に呼ぶ側が分ける */
    testid?: string;
    /**
     * 本家写しの面（箱の余白）に載せる。
     *
     * **字と面（置かれ方）は別物である。** 字はどこで出しても同じでなければならないので
     * ここが持つが、面は画面の作りに従う。本家写しの画面は本文を箱の中に置くので
     * これを立てる。自前の余白を持つ別レイアウトの中では寝かせる。立てると余白が二重になる。
     */
    surface?: boolean;
  }>(),
  { testid: 'document-source', surface: true },
);

const root = useTemplateRef<HTMLElement>('root');

/**
 * 位置の口。
 *
 * **口は `defineExpose` でこの2つのメソッドとして出す。** 面の実体（ここでは器の要素）を
 * 外へ渡さず、`PositionPort` をそのまま名乗る形にした。呼ぶ側は `ref` で受けた面を
 * `PositionPort` として扱えばよく、面の中身を知らずに済む。
 *
 * `MarkdownView` も同じ形で出せる。あちらの口は `data-src-start` の包み
 * （`../position/source-span.ts`）とフェンスの対応表（`../position/fence.ts`）から
 * 作られるが、口の形はここと変わらないので、外から見て両者は区別が付かない。
 * **面ごとに違う出し方をしないこと。** 出し方が分かれると注釈の側が面を分岐する。
 *
 * 中身が無いときは器そのものが描かれないので、どちらの向きも `null` になる。
 * 指す先が無いことをそのまま返す。
 */
function port(): PositionPort | null {
  const container = root.value;
  if (!container) return null;
  return createPlainPositionPort({ container, source: props.value ?? '' });
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
    字と余白は本家の実測。本家は `TextAnnotate` に inline style を渡している
    （`ApprovalsAnnotator.tsx` の `renderTextAnnotate`）:
      font-size 0.875rem（= 14px。`--text-sm` の 12px ではない）/ line-height 1.625 /
      white-space pre-wrap / word-break break-word
    箱の余白は `p-3 sm:p-4` だが、本家自身の素のクラス `.p-3` が Tailwind の
    レスポンシブ指定を打ち消すので実測は常に 12px（承認カードと同じ現象）。

    生テキストは1つの補間として出す。要素を挟むと text ノードが割れ、位置の口が
    「器の中の何文字目か」を数え直す羽目になる（割れても数えられるようにはしてあるが、
    割る理由がここに無い）。
  -->
  <pre
    v-if="props.value"
    ref="root"
    v-bind="$attrs"
    class="whitespace-pre-wrap font-mono text-[0.875rem]/[1.625] [word-break:break-word]"
    :class="props.surface ? 'p-3' : ''"
    :data-testid="props.testid"
  >{{ props.value }}</pre>
  <slot v-else name="empty" />
</template>
