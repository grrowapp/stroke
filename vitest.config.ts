import { fileURLToPath } from 'node:url';

import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  // Nuxt の specifier を単体テストから引けるようにする。
  //
  // `modules/markdown/runtime/render/MarkdownView.vue` はコンポーネントそのものを検査したく、
  // そのために `#components` と `#imports` の解決が要る。Nuxt を立てれば本物が引けるが、
  // `@vitest-environment nuxt` はこの組み合わせ（vitest 4.1.11 + @nuxt/test-utils 4.1.0）で
  // 動かない。環境が node にフォールバックしたうえで `dist/runtime/entry.mjs` の beforeAll が
  // 固まり、`--hookTimeout` でも動かせない 10000ms で落ちる（実測。空のテストでも落ちる）。
  //
  // `#imports` を `vue` に向けられるのは、モジュールが使うのが `useTemplateRef` だけで
  // Vue 3.5 が同名で持つため。**それ以外を使い始めたらこの alias は足りなくなる。**
  alias: {
    '#imports': 'vue',
    '#components': fileURLToPath(new URL('./test/stubs/nuxt-components.ts', import.meta.url)),
  },
  test: {
    // 既定は Node 環境。DOM が要るテストだけ `// @vitest-environment nuxt` を付ける。
    // テストは `test/` にまとめる。ソースの構造をそのまま写した位置に置く
    // （`test/server/utils/control/notify.test.ts` ↔ `server/utils/control/notify.ts`）。
    //
    // `server/` 配下にもソースと同じ階層に置かれたテストが残っている。`test/` だけを
    // 拾っていた頃はそれらが**一度も走っていなかった**ので、収集対象に足してある
    // （置き場を `test/` に寄せるのは別の対応）。
    include: ['test/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  },
});
