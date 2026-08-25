import { defineVitestConfig } from '@nuxt/test-utils/config';

/**
 * 稼働中の本家に対して実際に叩くテスト。
 *
 * NUXT_UPSTREAM_BASE_URL が指すダッシュボードが起動している必要がある。
 * 起動していない環境で失敗しても、それは本家が動いていないという事実であって
 * stroke-board の不具合ではない。だから通常の `yarn test` からは外してある。
 */
export default defineVitestConfig({
  test: {
    include: ['test/**/*.live.test.ts'],
  },
});
