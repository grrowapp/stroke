import { expect, test } from '@playwright/test';

import { ALPHA, resetBoard, stub } from './support';

/**
 * 下層と、通知からの導線（specs/project-workspace）。
 */
test.describe('下層のプロジェクト画面', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('サイドバーは4項目。統計もログも無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    const items = await page.locator('[data-testid="workspace-sidebar"] a').allTextContents();
    expect(items.map((item) => item.trim())).toEqual(['仕様書', 'ステアリング', 'タスク', '承認']);
  });

  test('上層はタブ、下層はサイドバーで形が違う', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tab-notifications')).toBeVisible();
    await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);

    await page.goto(`/projects/${ALPHA}/specs`);
    await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
    await expect(page.getByTestId('tab-notifications')).toHaveCount(0);
  });

  test('ヘッダー左からポータルへ戻れる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    await page.getByTestId('back-to-portal').click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('下層にプロジェクト切替の口は無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    const links = await page.locator('[data-testid="workspace-sidebar"] a').evaluateAll((items) =>
      items.map((item) => item.getAttribute('href')),
    );

    expect(links.every((href) => href?.includes(ALPHA))).toBe(true);
  });

  test('今いるプロジェクトが分かる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    await expect(page.getByTestId('workspace-project-name')).toHaveText('alpha');
  });

  test('解決できない projectId は未接続として扱う', async ({ page }) => {
    await page.goto('/projects/NOSUCHPROJECT/specs');
    await expect(page.getByTestId('workspace-unresolved')).toBeVisible();
  });

  test('仕様書が並ぶ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    await expect(page.getByTestId('spec-row')).toHaveCount(1);
    await expect(page.getByTestId('spec-row')).toContainText('auth-spec');
  });

  test('ステアリングは3本固定で、未作成が分かる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    await expect(page.getByTestId('steering-row')).toHaveCount(3);
    await expect(page.getByTestId('steering-row').filter({ hasText: 'structure.md' })).toContainText('未作成');
  });

  test('タスクが読める。状態を変える操作は無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks`);

    await expect(page.getByTestId('task-row')).toHaveCount(3);
    await expect(page.getByTestId('tasks-summary')).toContainText('1 / 3 完了');

    const buttons = await page.locator('[data-testid="task-row"] button').count();
    expect(buttons).toBe(0);
  });

  test('承認が0件のときはその旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals`);
    await expect(page.getByTestId('approvals-empty')).toBeVisible();
  });

  test('承認依頼と対象文書の中身が読める。承認・却下の操作は無い', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'w1',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await page.goto(`/projects/${ALPHA}/approvals`);

    await expect(page.getByTestId('approval-row')).toHaveCount(1);
    await expect(page.getByTestId('approval-content')).toContainText('本文');

    // 一覧の行は承認依頼の題名を持つので、操作ボタンだけを名前の完全一致で見る
    await expect(page.getByRole('button', { name: /^(承認|却下|Approve|Reject)$/ })).toHaveCount(0);
  });
});

test.describe('通知からの導線', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('タスクの通知からタスク画面へ着地する', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks$`));
    await expect(page.getByTestId('tasks-list')).toBeVisible();
  });

  test('承認依頼の通知から承認画面へ着地する', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'nav1',
      title: 'ステアリング: tech.md の承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));
    await expect(page.getByTestId('approval-row')).toHaveCount(1);
  });

  test('キーボードだけで通知から対象を開ける', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks$`));
  });
});
