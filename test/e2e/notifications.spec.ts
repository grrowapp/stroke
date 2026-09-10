import { ALPHA, BETA, expect, resetBoard, stub, test } from './support';

/**
 * 通知の発生から一覧・トースト・飛び先まで（specs/notification-feed, notification-toast）。
 */
test.describe('通知', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('通知が1件も無いときはその旨が出る', async ({ page }) => {
    await expect(page.getByTestId('notifications-empty')).toBeVisible();
  });

  test('接続直後は通知が出ない', async ({ page }) => {
    await page.waitForTimeout(500);
    await expect(page.getByTestId('notification-row')).toHaveCount(0);
  });

  test('タスクが完了すると通知が1件出る', async ({ page }) => {
    await stub.completeTask(ALPHA);

    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(page.getByTestId('notification-row')).toHaveAttribute('data-kind', 'task-completed');
  });

  test('タスク完了の通知はタスク画面が飛び先になる', async ({ page }) => {
    await stub.completeTask(ALPHA);

    await expect(page.getByTestId('notification-row')).toHaveAttribute('data-target', 'tasks');
  });

  test('タスクに着手すると通知が出る', async ({ page }) => {
    await stub.startTask(ALPHA, '1.2');

    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(page.getByTestId('notification-row')).toHaveAttribute('data-kind', 'task-started');
  });

  test('全件完了すると タスク完了 と 全件完了 の2件が出る', async ({ page }) => {
    // 初期状態は 1/3 完了。残り2件を完了させると全件完了になる
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(3);

    const kinds = await page.getByTestId('notification-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-kind')),
    );

    expect(kinds).toContain('all-tasks-completed');
    expect(kinds.filter((kind) => kind === 'task-completed')).toHaveLength(2);
  });

  test('承認依頼が立つと通知が出る', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'ap1',
      title: '要件定義の承認',
      filePath: '.spec-workflow/specs/auth-spec/requirements.md',
      category: 'spec',
      categoryName: 'auth-spec',
    });

    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(page.getByTestId('notification-row')).toHaveAttribute('data-kind', 'approval-requested');
  });

  test('ステアリング文書への承認依頼も通知になる', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'ap-steering',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(page.getByTestId('notification-row')).toContainText('ステアリング');
  });

  test('承認依頼の通知は承認画面が飛び先になる', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'ap2',
      title: 'ステアリング: tech.md の承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await expect(page.getByTestId('notification-row')).toHaveAttribute('data-target', 'approvals');
  });

  test('承認依頼が保留中でなくなっても通知は出ない', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'ap3',
      title: '消える承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await stub.resolveApproval(ALPHA, 'ap3');
    await page.waitForTimeout(300);

    await expect(page.getByTestId('notification-row')).toHaveCount(1);
  });

  test('ステアリングの同期信号は通知にならない', async ({ page }) => {
    await stub.steeringUpdate(ALPHA);
    await page.waitForTimeout(300);

    await expect(page.getByTestId('notification-row')).toHaveCount(0);
  });

  test('複数プロジェクトの通知が1つの一覧に並ぶ', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await stub.completeTask(BETA);

    await expect(page.getByTestId('notification-row')).toHaveCount(2);

    const projects = await page.getByTestId('notification-open').evaluateAll((cells) =>
      cells.map((cell) => cell.textContent?.trim()),
    );

    expect(new Set(projects)).toEqual(new Set(['alpha', 'beta']));
  });

  test('一覧の4列が揃っている', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    const headers = await page.locator('[data-testid="notifications-table"] th').allTextContents();
    expect(headers).toEqual(['プロジェクト', '種別', '内容', '最終更新']);
  });

  test('新しい通知が先頭に来る', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await stub.startTask(BETA, '1.2');
    await expect(page.getByTestId('notification-row')).toHaveCount(2);

    const kinds = await page.getByTestId('notification-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-kind')),
    );

    expect(kinds[0]).toBe('task-started');
  });
});

test.describe('通知が起きるとプロジェクト一覧の未処理件数に出る', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('通知が発生したプロジェクトの行にバッジが出る', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('tab-projects').click();

    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });
    await expect(row.getByTestId('project-unread')).toHaveText('1');
  });

  test('通知が無いプロジェクトの行は — のまま', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('tab-projects').click();

    const row = page.getByTestId('project-row').filter({ hasText: 'beta' });
    await expect(row.getByTestId('project-unread')).toHaveText('—');
  });
});

test.describe('通知一覧の各列が prototype と同じ様式になっている', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);
  });

  test('プロジェクト列は 12px の secondary', async ({ page }) => {
    const style = await page.getByTestId('notification-open').evaluate((element) => {
      const own = getComputedStyle(element);
      return { fontSize: own.fontSize, color: own.color };
    });

    expect(style.fontSize).toBe('12px');
    expect(style.color).toBe('rgb(203, 213, 225)');
  });

  test('種別列は無彩色の文字。チップにはしない', async ({ page }) => {
    const cell = page.getByTestId('notification-row').locator('td').nth(1);

    await expect(cell.locator('.sb-chip')).toHaveCount(0);
    expect(await cell.evaluate((element) => getComputedStyle(element).color)).toBe(
      'rgb(148, 163, 184)',
    );
  });

  test('内容列は上段が件名、下段が spec 名の 12px', async ({ page }) => {
    const cell = page.getByTestId('notification-row').locator('td').nth(2);

    const sizes = await cell.locator('div').evaluateAll((divs) =>
      divs.map((div) => getComputedStyle(div).fontSize),
    );

    expect(sizes).toEqual(['13px', '12px']);
  });

  test('最終更新列は 12px の secondary', async ({ page }) => {
    const style = await page
      .getByTestId('notification-row')
      .locator('td')
      .nth(3)
      .evaluate((element) => {
        const own = getComputedStyle(element);
        return { fontSize: own.fontSize, color: own.color };
      });

    expect(style.fontSize).toBe('12px');
    expect(style.color).toBe('rgb(203, 213, 225)');
  });
});

/**
 * 起動直後でも「今の承認待ち」が見えること。
 *
 * 通知は接続後に起きた変化しか出せないので、起動直後の通知画面は必ず空になる。それを
 * 「何も起きていない」と読ませると、「どのプロジェクトで承認待ちが起きたかを見に行かないと
 * 分からない」という解くべき問題がそのまま残る（product.md の Purpose）。
 */
test.describe('通知が0件でも今の承認待ちは見える', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('保留中が無ければ何も出さない', async ({ page }) => {
    await expect(page.getByTestId('notifications-empty')).toBeVisible();
    await expect(page.getByTestId('pending-now')).toHaveCount(0);
  });

  test('繋ぐ前から待っていた承認は通知にならないが、件数として出る', async ({ page }) => {
    await resetBoard(page, {
      whileDisconnected: () =>
        stub.requestApproval(ALPHA, {
          id: 'standing1',
          title: '前から待っている承認',
          filePath: '.spec-workflow/steering/product.md',
          category: 'steering',
          categoryName: 'steering',
        }),
    });

    // 接続時の基準に取り込まれるので通知は出ない
    await expect(page.getByTestId('notification-row')).toHaveCount(0);

    await expect(page.getByTestId('pending-now')).toContainText('1 件');
    await expect(page.getByTestId('pending-now-row')).toHaveAttribute('data-name', 'alpha');
  });

  test('そこから承認画面へ入れる', async ({ page }) => {
    await resetBoard(page, {
      whileDisconnected: () =>
        stub.requestApproval(ALPHA, {
          id: 'standing2',
          title: '前から待っている承認',
          filePath: '.spec-workflow/steering/tech.md',
          category: 'steering',
          categoryName: 'steering',
        }),
    });

    await page.getByTestId('pending-now-row').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));
  });

  test('プロジェクト一覧の未処理にも出る', async ({ page }) => {
    await resetBoard(page, {
      whileDisconnected: () =>
        stub.requestApproval(ALPHA, {
          id: 'standing3',
          title: '前から待っている承認',
          filePath: '.spec-workflow/steering/tech.md',
          category: 'steering',
          categoryName: 'steering',
        }),
    });

    await page.goto('/projects');

    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });
    await expect(row.getByTestId('project-unread')).toHaveText('1');
  });

  test('未接続のプロジェクトは数えられないので — のまま', async ({ page }) => {
    await page.goto('/projects');

    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });
    await expect(row.getByTestId('project-unread')).toHaveText('—');
  });
});

test.describe('通知も行全体が押せる', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);
  });

  test('内容のセルを押しても対象が開く', async ({ page }) => {
    await page.getByTestId('notification-row').locator('td').nth(2).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks/auth-spec$`));
  });

  test('最終更新のセルを押しても対象が開く', async ({ page }) => {
    await page.getByTestId('notification-row').locator('td').nth(3).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks/auth-spec$`));
  });
});
