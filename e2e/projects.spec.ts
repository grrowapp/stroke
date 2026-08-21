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

    await expect(page).toHaveURL(/\/projects\/ALPHAID000000001$/);
    await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
  });

  test('登録と作成は非活性の入口として置かれている', async ({ page }) => {
    await expect(page.getByTestId('register-project')).toBeDisabled();
    await expect(page.getByTestId('create-project')).toBeDisabled();
  });
});

/**
 * prototype（archive の navigation.prototype.html の案A）の projTable と同じ列を持つこと。
 */
test.describe('一覧の列は prototype と同じ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('4列ある', async ({ page }) => {
    const headers = await page.locator('[data-testid="projects-table"] th').allTextContents();
    expect(headers.map((header) => header.trim())).toEqual([
      'プロジェクト',
      '状態',
      '未処理の通知',
      '最終更新',
    ]);
  });

  test('アクティブな行は状態列に PID を出す', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });
    await expect(row.getByTestId('project-pid')).toContainText('PID');
  });

  test('未接続の行に PID は出ない', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    await expect(row.getByTestId('project-pid')).toHaveCount(0);
  });

  test('未処理の通知が無ければ — を出す', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    await expect(row.getByTestId('project-unread')).toHaveText('—');
  });

  test('最終更新は未接続でも出る。本家 API から取れない情報なので走査で拾う', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    await expect(row.getByTestId('project-last-modified')).not.toHaveText('—');
  });
});

/**
 * 作成の接続先（interview Q40）。stroke-board は入口だけを持ち、接続が無ければ作成は
 * 行えず、その状態は画面に出る。
 */
test.describe('登録・作成が行えない理由が画面に出る', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('接続先に繋がっていないため作成できないことが文言で分かる', async ({ page }) => {
    await expect(page.getByTestId('actions-blocked')).toContainText('接続先の別プロジェクト');
  });

  test('登録の理由は作成とは別に出る', async ({ page }) => {
    const reasons = await page.getByTestId('actions-blocked').locator('li').allTextContents();

    expect(reasons).toHaveLength(2);
    expect(new Set(reasons).size).toBe(2);
    expect(reasons.some((reason) => reason.includes('登録が何を指すか'))).toBe(true);
  });

  test('理由は title 属性だけでなく画面の文言として出ている', async ({ page }) => {
    await expect(page.getByTestId('actions-blocked')).toBeVisible();
  });

  test('可否はサーバーが返す状態から決まる', async ({ request }) => {
    const response = await request.get('/api/projects');
    const body = (await response.json()) as {
      actions: { create: { available: boolean; reason?: string } };
    };

    expect(body.actions.create.available).toBe(false);
    expect(body.actions.create.reason).toBe('target-undecided');
  });
});
