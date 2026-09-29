import type { Page } from '@playwright/test';

import { expect, test } from './support';

/**
 * 上層の URL と画面の対応（specs/screen-flow・`docs/specs/architecture/screen-flow.md`）。
 *
 * `/` を開いても他の URL へ移らないことを、実装の読みではなくテストで固定する。
 * 自動の遷移は1行で足せるので、書かないという決めだけでは次に起きたときに気づけない。
 */
function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

/** 自動の遷移が起きるなら起ききるだけの間、何も操作せずに待つ */
const IDLE_MS = 2_000;

test.describe('ルートは stroke 初期画面', () => {
  test('ルートを開いて待っても、URL はルートのまま', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('stroke-modal')).toBeVisible();

    await page.waitForTimeout(IDLE_MS);

    expect(pathOf(page)).toBe('/');
    await expect(page.getByTestId('stroke-modal')).toBeVisible();
    // プロジェクト画面にも通知にも着いていない
    await expect(page.getByTestId('project-row')).toHaveCount(0);
    await expect(page.getByTestId('notifications-table')).toHaveCount(0);
  });

  test('ルートを再読み込みしても、ルートのまま stroke 初期画面が出る', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('stroke-modal')).toBeVisible();

    await page.reload();
    await page.waitForTimeout(IDLE_MS);

    expect(pathOf(page)).toBe('/');
    await expect(page.getByTestId('stroke-modal')).toBeVisible();
    await expect(page.getByRole('button', { name: '投稿' })).toBeVisible();
  });

  test('ルートとストローク開始の URL は同じ中身を出す', async ({ page }) => {
    await page.goto('/');
    const modal = page.getByTestId('stroke-modal');
    await expect(modal).toBeVisible();
    const fromRoot = await modal.innerText();

    await page.goto('/strokes');
    await expect(modal).toBeVisible();
    const fromStrokes = await modal.innerText();

    expect(fromRoot).toBe(fromStrokes);
  });
});

test.describe('作成の飛び先はルートではない', () => {
  test('プロジェクト一覧の作成を押すと、ストローク開始の URL になる', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(/\/strokes$/);
    expect(pathOf(page)).not.toBe('/');
  });
});

test.describe('通知は固有の URL を持つ', () => {
  test('通知の URL を開くと通知の一覧が出る', async ({ page }) => {
    await page.goto('/notifications');

    await expect(page.getByTestId('notifications-table')).toBeVisible();
    await expect(page.getByTestId('stroke-modal')).toHaveCount(0);
  });

  test('通知のタブを押すと通知の URL へ移る', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('tab-notifications').click();

    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByTestId('notifications-table')).toBeVisible();
  });
});
