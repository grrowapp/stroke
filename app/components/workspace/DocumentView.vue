<script setup lang="ts">
/**
 * 文書の本文を出す。仕様書・ステアリング・承認対象のいずれもこれを使う。
 *
 * 読むだけ。編集も承認も置かない（specs/project-workspace）。
 *
 * 本家は文書を markdown として描いている（`MDXEditorWrapper` 経由）。生テキストのまま
 * 出すと、見出しも表もコードブロックも潰れて本家と別物になるので、ここで markdown を
 * 解釈する。使うのは md4x の `parseAST`。生 HTML は AST の時点で隔離されて返るので、
 * それを描かないことで sanitizer 無しに済ませている（`MarkdownNodes.ts`）。
 */
import { computed } from '#imports';
// md4x の既定の入口（`md4x`）は型が AST の型だけで、関数を export していない（0.0.29）。
// `md4x/standalone` は WASM を埋め込んだ実装で、型も関数も揃っている。サーバとブラウザで
// 同じ経路を通るので、ネイティブバイナリの有無で挙動が変わらない利点もある。
import { init, parseAST } from 'md4x/standalone';

import EmptyState from '~/components/workspace/EmptyState.vue';
import MarkdownNodes from '~/components/workspace/MarkdownNodes';

const props = withDefaults(
  defineProps<{ content: string | null | undefined; missing?: string }>(),
  { missing: 'この文書はまだ作られていません。' },
);

/**
 * md4x は WASM を読み込むまで描けない。SSR でも本文を出す（画面を開いた時点で読める）
 * ため、ここで待ってから描く。Nuxt のページは Suspense の下にあるので await できる。
 */
await init();

const nodes = computed(() => (props.content ? parseAST(props.content).nodes : []));
</script>

<template>
  <MarkdownNodes v-if="content" :nodes="nodes" />
  <EmptyState v-else testid="document-missing" title="中身がありません">
    {{ missing }}
  </EmptyState>
</template>
