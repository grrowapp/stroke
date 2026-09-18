<script setup lang="ts">
/**
 * markdown の ```mermaid フェンスを図にする。
 *
 * 本家は `mermaidPlugin.tsx` で npm の `mermaid` を直に呼び、返った SVG 文字列を
 * `.mermaid-container` に流し込んでいる。ここもその手順をそのまま写す
 * （initialize → render → 差し込み）。本家が持つホバーの「Edit」ボタンは、
 * 文書がエディタであることに由来する機能なので、読むだけのこの画面には入れない。
 *
 * **サーバでは描けない。** mermaid はレイアウトを決めるのに DOM の計測（getBBox など）を
 * 使うので Nitro では動かない。本文は SSR で出したいので、本文の描画そのものは止めず、
 * 図の枠だけを「Loading diagram...」としてサーバとクライアントの初期描画で一致させ、
 * `onMounted` 以降に SVG へ差し替える。こうすると hydration は枠の状態どうしで揃い、
 * 本文は画面を開いた時点で読める（DocumentView の SSR 前提を壊さない）。
 *
 * **注釈の付いた図には生テキストを添える。** 図は絵なので、図の中のある字を指す位置が
 * 画面上に無い。そこで `showSource` が立った図にだけ、もとになったフェンスの生テキストを
 * 図の下に出す。絵と、指摘の対象の両方を見せるための足しであって、**図の置き換えではない**
 * （図は消さない）。立てるかどうかを決めるのは外（`./source-shown.ts`）で、ここは知らない。
 */
import { computed, onMounted, ref, watch } from 'vue';

import { useColorMode } from '#imports';
import UAlert from '#ui/components/Alert.vue';
import USkeleton from '#ui/components/Skeleton.vue';

import { SOURCE_END_ATTR, SOURCE_START_ATTR } from '../position/source-span';
import type { SourceRange } from '../position/types';
import { FENCE_SOURCE_ATTR } from './source-shown';

const props = withDefaults(
  defineProps<{
    code: string;
    /** 生テキストを添えるか。既定は添えない（図だけを出す） */
    showSource?: boolean;
    /** このフェンスが占める生テキストの範囲。添えた生テキストに印として付ける */
    sourceRange?: SourceRange | null;
  }>(),
  { showSource: false, sourceRange: null },
);

/**
 * 添えた生テキストに付ける印。
 *
 * 中身は `pre.props.code`（タブを開き、器の前置きを剥がした後の文字列）なので、位置の口は
 * 文字数をそのまま数えられない。**そのための目印と材料**を属性で置いておく
 * （`./source-shown.ts` の `FENCE_SOURCE_ATTR`）。範囲が分からなければ印も付けない。
 */
const sourceMarks = computed<Record<string, string | number>>(() => {
  const marks: Record<string, string | number> = {};
  const range = props.sourceRange;
  if (!range) return marks;

  marks[FENCE_SOURCE_ATTR] = '';
  marks[SOURCE_START_ATTR] = range.start;
  marks[SOURCE_END_ATTR] = range.end;
  return marks;
});

/**
 * エラーの枠（`UAlert`）の見た目。
 *
 * 足すのは本文の並びの中での余白（前後 16px）と、畳んだ元ソースの組みだけ。
 * 子の要素へ当てる指定も `ui` の側に持たせ、template には class を書かない。
 */
const ERROR_UI = {
  root: 'my-4',
  description:
    'text-xs [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_details]:mt-2 [&_summary]:cursor-pointer [&_details_pre]:mt-2 [&_details_pre]:text-muted',
} as const;

/**
 * 描く前の枠（`USkeleton`）の見た目。
 *
 * 高さは図が入る場所を先に取るためのもので、以前の枠（`p-4` ＋ 中の `h-32`）と同じ 160px。
 */
const LOADING_UI = {
  base: 'my-4 flex h-40 items-center justify-center text-sm text-muted',
} as const;

/**
 * 本家 `hooks/useMDXEditorTheme.ts` の `mermaidThemeVariables` をそのまま写す。
 * 値を足したり寄せたりすると本家と絵が変わるので、写し以上のことをしない。
 */
const DARK_THEME_VARIABLES = {
  primaryColor: '#3B82F6',
  primaryTextColor: '#E5E7EB',
  primaryBorderColor: '#6B7280',
  lineColor: '#9CA3AF',
  secondaryColor: '#1F2937',
  tertiaryColor: '#374151',
  background: '#111827',
  mainBkg: '#1F2937',
  secondBkg: '#374151',
  tertiaryBkg: '#4B5563',
} as const;

const LIGHT_THEME_VARIABLES = {
  primaryColor: '#3B82F6',
  lineColor: '#374151',
} as const;

const colorMode = useColorMode();

/** 描けた SVG。空の間は「まだ描けていない」を意味する（本家の `svg` state と同じ） */
const svg = ref('');
/** mermaid が投げた文言。空でなければエラー面を出す */
const failure = ref('');

async function draw(): Promise<void> {
  // サーバ側にこの分岐ごと残らないようにする（mermaid をサーバのバンドルに引き込まない）
  if (!import.meta.client) return;
  if (!props.code) return;

  try {
    const { default: mermaid } = await import('mermaid');
    const dark = colorMode.value === 'dark';

    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'default',
      themeVariables: dark ? { ...DARK_THEME_VARIABLES } : { ...LIGHT_THEME_VARIABLES },
      securityLevel: 'loose',
    });

    // mermaid は描画中の要素をこの id で body に置くので、図ごとに違う値が要る
    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
    const { svg: rendered } = await mermaid.render(id, props.code);

    svg.value = rendered;
    failure.value = '';
  } catch (error) {
    failure.value = error instanceof Error ? error.message : 'Failed to render diagram';
    svg.value = '';
  }
}

onMounted(draw);

// 文書を差し替えたとき・テーマを変えたときは描き直す（本家の useEffect の依存と同じ）
watch([(): string => props.code, (): string => colorMode.value], draw);
</script>

<template>
  <!--
    エラー: 本家と同じく文言と元ソースを畳んで出す。

    **枠は @nuxt/ui の `UAlert`。** 以前はここに本家の className（`bg-red-900/20
    border-red-800` など）を直書きし、「本家のどれを写したのかが読めなくなる」ことを理由に
    design token へ寄せないと決めていた（change `adopt-upstream-design-tokens` の design D5）。
    その決めは「@nuxt/ui が持つ部品と仕組みを自前で再実装しない」という後からの決定に
    上書きされている。ここは `UAlert` の error 色に委ね、余白だけを `ui` で合わせる。
  -->
  <UAlert
    v-if="failure"
    color="error"
    variant="subtle"
    title="Mermaid Diagram Error"
    :ui="ERROR_UI"
    data-testid="mermaid-error"
  >
    <template #description>
      <pre>{{ failure }}</pre>
      <details>
        <summary>Show source</summary>
        <pre>{{ code }}</pre>
      </details>
    </template>
  </UAlert>

  <!--
    描く前。SSR と hydration 直後はここ。図の分の高さを先に取っておく。

    **枠は @nuxt/ui の `USkeleton`。** 明滅と面はそれが持つ（`animate-pulse` /
    `bg-elevated`）。上のエラーと同じく、本家の className の写しはやめている。
  -->
  <USkeleton v-else-if="!svg" :ui="LOADING_UI" data-testid="mermaid-loading">
    <span>Loading diagram...</span>
  </USkeleton>

  <!--
    成功。`sb-mermaid` は本家の `.mermaid-container` の写し。
    差し込むのは mermaid が組み立てた SVG で、本家も同じ（`dangerouslySetInnerHTML`）。

    **生テキストを添えないときは、器を1つも増やさない。** 既定の見え方を1画素も変えない
    ためで、下の枝と共通化しない（`.sb-mermaid` は `display:flex` なので、間に器を挟むと
    SVG の伸び方が変わる）。
  -->
  <div v-else-if="!props.showSource" class="sb-mermaid" data-testid="mermaid-diagram" v-html="svg" />

  <!--
    成功、かつ生テキストを添える。

    **添えても本文の他の箇所が動かない。** 添えたものを図の枠の中へ絶対配置で収めるので、
    枠の高さは図だけのときと同じままになる（外側の器は余白も枠線も持たないので、
    `.sb-mermaid` の margin はそのまま外へ抜ける）。注釈が付いた瞬間に後ろの段落が
    ずり下がると読めなくなるため、この形は要件である。

    畳めるようにしてあるのは、生テキストが図の下側に重なるからである。既定は開いた状態
    （注釈の指す字がすぐ見える）で、絵の全体を見たいときに畳む。
  -->
  <div v-else class="relative" data-testid="mermaid-with-source">
    <div class="sb-mermaid" data-testid="mermaid-diagram" v-html="svg" />
    <!--
      `not-prose` を付けるのは、この `pre` に Tailwind Typography の `pre` の型
      （面・余白・字送り）が当たらないようにするため。生テキストの面（`MarkdownSource.vue`）
      と同じ見え方にしたいので、本文の型を通さない。
    -->
    <details
      open
      class="not-prose absolute inset-x-4 bottom-4 max-h-[60%] overflow-auto rounded-md border border-gray-700 bg-gray-900 shadow-lg"
      data-testid="mermaid-source"
    >
      <summary class="cursor-pointer px-3 py-1 text-xs text-gray-400">Source</summary>
      <!--
        字は生テキストの面の写し（本家 `TextAnnotate` の実測: 0.875rem / 1.625 /
        pre-wrap / break-word）。**1つの補間として出す**のも同じ理由で、要素を挟むと
        text ノードが割れて位置の口が数え直しになる。
      -->
      <pre
        v-bind="sourceMarks"
        class="px-3 pb-3 font-mono text-[0.875rem]/[1.625] whitespace-pre-wrap text-gray-300 [word-break:break-word]"
      >{{ props.code }}</pre>
    </details>
  </div>
</template>
