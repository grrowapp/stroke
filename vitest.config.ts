import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    // 既定は Node 環境。DOM が要るテストだけ `// @vitest-environment nuxt` を付ける。
    // テストは `test/` にまとめる。ソースの構造をそのまま写した位置に置く
    // （`test/server/utils/control/notify.test.ts` ↔ `server/utils/control/notify.ts`）。
    include: ['test/**/*.test.ts'],
    // *.live.test.ts は稼働中の本家を要求するので通常の実行からは外す。`yarn test:live` で走らせる
    exclude: ['**/node_modules/**', '**/*.live.test.ts'],
  },
});
