import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
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
