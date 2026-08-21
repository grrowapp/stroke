import { expect, test } from '@playwright/test';

import { ALPHA, BETA, resetBoard, stub } from './support';

/**
 * トースト（specs/notification-toast）。本家と同じ形にする。
 */
test.describe('通知トースト', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('通知が発生するとトーストが出る', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);
  });

  test('複数同時に発生したら縦に積まれる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await stub.completeTask(BETA);

    await expect(page.getByTestId('toast')).toHaveCount(2);
  });

  test('5秒で自動的に消える', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 8_000 });
  });

  test('× ボタンで即座に消える', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    await page.getByTestId('toast-dismiss').click();
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });

  test('タスク完了は success の色になる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveAttribute('data-tone', 'success');
  });

  test('承認依頼は info の色になる', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'tone1',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await expect(page.getByTestId('toast')).toHaveAttribute('data-tone', 'info');
  });

  test('トーストのテキストを押しても何も起きない', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    await page.getByTestId('toast').locator('p').click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('トーストが出てもフォーカスは奪われない', async ({ page }) => {
    await page.getByTestId('tab-projects').focus();

    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused).toBe('tab-projects');
  });

  test('× ボタンにキーボードで到達できる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    await page.getByTestId('toast-dismiss').focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));

    expect(focused).toBe('toast-dismiss');
  });

  test('下層にいてもトーストは出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    // 画面を移ると WebSocket を張り直すので、繋がるまで待ってから起こす
    await expect(page.getByTestId('workspace-connection')).toHaveAttribute('data-connected', 'true');

    await stub.completeTask(BETA);

    await expect(page.getByTestId('toast')).toHaveCount(1);
  });

  test('画面を開き直しても過去分はトーストにならない', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});
