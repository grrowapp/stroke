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
 */
import { onMounted, ref, watch } from 'vue';

import { useColorMode } from '#imports';

const props = defineProps<{ code: string }>();

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
  <!-- エラー: 本家と同じく文言と元ソースを畳んで出す -->
  <div
    v-if="failure"
    class="my-4 rounded-lg border border-red-800 bg-red-900/20 p-4"
    data-testid="mermaid-error"
  >
    <p class="mb-2 text-sm font-medium text-red-300">Mermaid Diagram Error</p>
    <pre class="overflow-auto text-xs whitespace-pre-wrap text-red-400">{{ failure }}</pre>
    <details class="mt-2">
      <summary class="cursor-pointer text-xs text-red-400">Show source</summary>
      <pre class="mt-2 overflow-auto text-xs whitespace-pre-wrap text-gray-400">{{ code }}</pre>
    </details>
  </div>

  <!-- 描く前。SSR と hydration 直後はここ。図の分の高さを先に取っておく -->
  <div
    v-else-if="!svg"
    class="my-4 animate-pulse rounded-lg bg-gray-800 p-4"
    data-testid="mermaid-loading"
  >
    <div class="flex h-32 items-center justify-center rounded bg-gray-700">
      <span class="text-sm text-gray-400">Loading diagram...</span>
    </div>
  </div>

  <!--
    成功。`sb-mermaid` は本家の `.mermaid-container` の写し。
    差し込むのは mermaid が組み立てた SVG で、本家も同じ（`dangerouslySetInnerHTML`）。
  -->
  <div v-else class="sb-mermaid" data-testid="mermaid-diagram" v-html="svg" />
</template>
