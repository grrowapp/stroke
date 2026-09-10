import type { Browser } from '@playwright/test';

import { expect, test } from './support';

/**
 * プロジェクト一覧の「最終更新」が、**ハイドレーションでずれない**ことを見る。
 *
 * 相対時刻（「今」「19時間前」）は基準になる「現在時刻」で文言が変わる。SSR がサーバーの時計で
 * 描き、ブラウザが自分の時計で描き直すと、刻みの境界をまたいだ行の文言が入れ替わる
 * （specs/portal/relative-time）。規範（`docs/specs/architecture/data-fetching.md`
 * 「最初のレンダリングを決定論的に保つ」）に従い、相対時刻は SSR で描かず mount の後にだけ描く
 * （`app/composables/useRelativeTime.ts` の `useRelativeTime`）。
 *
 * だからここは、**サーバが送った HTML の列が空で、mount 後の DOM の列に文言が入っている**ことを
 * 見る。SSR の HTML は `markdown-hydration.spec.ts` と同じ手で控える。
 *
 * **ブラウザの時計をわざと8日ずらす。** 走査先（`.e2e-tmp/projects`）は run のたびに作られるので
 * 最終更新は「今」〜「N分前」になる。サーバーの時計に依存した文言が SSR に混ざっていれば、
 * 8日ずらしたブラウザは絶対日時（7日超）へ描き直すので、SSR の列が空でないことが確実に露見する。
 */

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
const CELL = '[data-testid="project-last-modified"]';

/**
 * サーバが送った HTML そのものを DOM にして列を読む。JavaScript を切った文脈なので
 * スクリプトは動かず、ハイドレーションの前の姿が読める。
 */
async function cellsOfServerHtml(browser: Browser, html: string): Promise<string[]> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await page.locator(CELL).allTextContents();
  } finally {
    await context.close();
  }
}

test.describe('プロジェクト一覧の最終更新のハイドレーション', () => {
  test('サーバは最終更新を描かず、mount の後にブラウザが描く', async ({ browser }) => {
    const context = await browser.newContext();
    // ブラウザ側の `Date.now()` だけを進める。サーバーの時計はそのまま
    await context.addInitScript((shift: number) => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + shift;
    }, EIGHT_DAYS_MS);

    try {
      const page = await context.newPage();
      let served = '';

      // 配られた HTML を控える。**書き換えない**。素通しして、後で同じものと突き合わせる
      await page.route('/projects', async (route) => {
        const response = await route.fetch();
        served = await response.text();
        await route.fulfill({ response, body: served });
      });

      await page.goto('/projects');
      await expect(page.getByTestId('projects-table')).toBeVisible();

      expect(served, 'SSR の HTML を掴めていない').not.toBe('');
      const before = (await cellsOfServerHtml(browser, served)).map((text) => text.trim());
      expect(before.length, 'SSR の時点で最終更新の列が無い').toBeGreaterThan(0);

      // **サーバが相対時刻を描いているとここが落ちる。** 列そのものはあり、文言だけが無い
      expect(before, '最終更新の文言がサーバの HTML に入っている（現在時刻に依存する文言を SSR で描いている）').toEqual(
        before.map(() => ''),
      );

      // mount 後は全行に文言が入る。走査先は run のたびに作るので、取れない行（—）は無い
      const cells = page.locator(CELL);
      await expect(cells).toHaveCount(before.length);
      for (let index = 0; index < before.length; index += 1) {
        await expect(cells.nth(index), 'mount 後の最終更新が空のまま').not.toHaveText('');
        await expect(cells.nth(index), 'mount 後の最終更新が「—」になっている').not.toHaveText('—');
      }
    } finally {
      await context.close();
    }
  });
});
