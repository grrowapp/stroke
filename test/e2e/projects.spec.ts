import { expect, test } from './support';

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

  test('登録は非活性、作成は常に押せる', async ({ page }) => {
    // 作成の可否判定は仕組みごと廃止した（ADR 0010）。前提の欠けは概要投稿時に出る
    await expect(page.getByTestId('register-project')).toBeDisabled();
    await expect(page.getByTestId('create-project')).toBeEnabled();
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

  /**
   * PID は出さない（specs/project/directory「一覧は4つの列を持つ」）。一覧で下す判断は
   * 「その行に入るかどうか」だけで、PID はその判断に使われない。
   */
  test('アクティブな行にも PID は出ない', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });
    await expect(row.getByTestId('project-pid')).toHaveCount(0);
    await expect(row).toContainText('アクティブ');
  });

  test('未処理の通知が無ければ — を出す', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    await expect(row.getByTestId('project-unread')).toHaveText('—');
  });

  test('最終更新は未接続でも出る。本家 API から取れない情報なので走査で拾う', async ({ page }) => {
    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    // 相対時刻は mount の後にだけ入る（specs/portal/relative-time）。mount 前は空文字なので、
    // 「—」でないことだけでは走査した値が出たことにならない。空でないことも見る
    await expect(row.getByTestId('project-last-modified')).not.toHaveText('');
    await expect(row.getByTestId('project-last-modified')).not.toHaveText('—');
  });
});

/**
 * 入口の接合（ADR 0009・0010）。作成ボタンはただのボタンで、押すとストロークへ入る。
 * 可否判定は仕組みごと廃止したので、サーバーは可否を返さない。
 */
test.describe('作成の入口', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('可否の理由表示は無くなった', async ({ page }) => {
    await expect(page.getByTestId('actions-blocked')).toHaveCount(0);
  });

  test('一覧の応答は可否を返さない', async ({ request }) => {
    const response = await request.get('/api/projects');
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).not.toHaveProperty('actions');
    expect(body).toHaveProperty('directory');
  });

  test('作成を押すと概要入力がモーダルで開く', async ({ page }) => {
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(/\/strokes$/);
    await expect(page.getByTestId('stroke-modal')).toBeVisible();
  });

  test('モーダルには閉じる操作が無い', async ({ page }) => {
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('stroke-modal')).toBeVisible();

    // Esc も背景クリックも効かない。ストロークは最後まで行く（design.md D1）
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('stroke-modal')).toBeVisible();
    await expect(page).toHaveURL(/\/strokes$/);
  });

  test('リロードしても同じ場面がモーダルとして開き直る', async ({ page }) => {
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('stroke-modal')).toBeVisible();

    // 復帰は URL が担う。開閉の状態を画面側に持たない（design.md D1）
    await page.reload();

    await expect(page).toHaveURL(/\/strokes$/);
    await expect(page.getByTestId('stroke-modal')).toBeVisible();
  });
});

/**
 * 行全体が押せること。
 *
 * prototype は `<tr class="hit" data-open="...">` で行全体をクリック対象にしている。
 * cursor:pointer とホバー反転が付いているのに名前のテキストしか押せないと、行のどこを
 * 押しても開くように見えて開かない。
 */
test.describe('行全体が押せる', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  test('アクティブな行は状態のセルを押しても開く', async ({ page }) => {
    await page
      .getByTestId('project-row')
      .filter({ hasText: 'alpha' })
      .locator('td')
      .nth(1)
      .click();

    await expect(page).toHaveURL(/\/projects\/ALPHAID000000001$/);
  });

  test('アクティブな行は最終更新のセルを押しても開く', async ({ page }) => {
    await page
      .getByTestId('project-row')
      .filter({ hasText: 'beta' })
      .locator('td')
      .nth(3)
      .click();

    await expect(page).toHaveURL(/\/projects\/BETAID0000000002$/);
  });

  test('未接続の行はどこを押しても開かない', async ({ page }) => {
    await page
      .getByTestId('project-row')
      .filter({ hasText: 'idle-project' })
      .locator('td')
      .nth(1)
      .click();

    await expect(page).toHaveURL(/\/projects$/);
  });
});
