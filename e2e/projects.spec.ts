import { expect, test } from '@playwright/test';

/**
 * 上層 — プロジェクト一覧（specs/project-directory）。
 */
test.describe('プロジェクト一覧', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('走査で見つかったプロジェクトが並ぶ', async ({ page }) => {
    const rows = page.getByTestId('project-row');
    await expect(rows).toHaveCount(3);
  });

  test('アクティブが上、未接続が下に並ぶ', async ({ page }) => {
    const connections = await page.getByTestId('project-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-connection')),
    );

    expect(connections).toEqual(['active', 'active', 'disconnected']);
  });

  test('同じ区分の中では名前順に並ぶ', async ({ page }) => {
    const names = await page.getByTestId('project-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-name')),
    );

    expect(names).toEqual(['alpha', 'beta', 'idle-project']);
  });

  test('未接続の行は押せない', async ({ page }) => {
    const idle = page.getByTestId('project-row').filter({ hasText: 'idle-project' });

    await expect(idle.getByTestId('project-enter')).toHaveCount(0);
    await expect(idle.getByTestId('project-name-disabled')).toBeVisible();
  });

  test('未接続の行はキーボードのフォーカスを受けない', async ({ page }) => {
    const focusable = await page
      .getByTestId('project-row')
      .filter({ hasText: 'idle-project' })
      .locator('button, a, [tabindex]')
      .count();

    expect(focusable).toBe(0);
  });

  test('アクティブな行から下層へ入れる', async ({ page }) => {
    await page.getByTestId('project-row').filter({ hasText: 'alpha' }).getByTestId('project-enter').click();

    await expect(page).toHaveURL(/\/projects\/ALPHAID000000001\/specs$/);
    await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  });

  test('登録と作成は非活性の入口として置かれている', async ({ page }) => {
    await expect(page.getByTestId('register-project')).toBeDisabled();
    await expect(page.getByTestId('create-project')).toBeDisabled();
  });
});
