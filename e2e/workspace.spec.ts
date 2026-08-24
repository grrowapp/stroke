import { expect, test } from '@playwright/test';

import { ALPHA, resetBoard, stub } from './support';

/**
 * 下層のプロジェクト画面（specs/project-workspace）。
 *
 * 一覧と本文は別のページに分ける。本家のダッシュボードは対象を URL で指せず、それが
 * 「どのプロジェクトの何が起きたか」を指すリンクを作れない原因になっている
 * （product.md の Purpose）。stroke-board はそれを繰り返さない。
 */
test.describe('下層のシェル', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('サイドバーは5項目。統計もログも無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);

    const items = await page.locator('[data-testid="workspace-sidebar"] a').allTextContents();
    expect(items.map((item) => item.trim())).toEqual([
      '概要',
      'Feature',
      'ステアリング',
      'タスク',
      '承認',
    ]);
  });

  test('上層はタブ、下層はサイドバーで形が違う', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('tab-notifications')).toBeVisible();
    await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);

    await page.goto(`/projects/${ALPHA}`);
    await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
    await expect(page.getByTestId('tab-notifications')).toHaveCount(0);
  });

  test('ヘッダー左からポータルへ戻れる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);
    await page.getByTestId('back-to-portal').click();

    await expect(page).toHaveURL(/\/$/);
  });

  test('下層にプロジェクト切替の口は無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);

    const links = await page.locator('[data-testid="workspace-sidebar"] a').evaluateAll((items) =>
      items.map((item) => item.getAttribute('href')),
    );

    expect(links.every((href) => href?.includes(ALPHA))).toBe(true);
  });

  test('今いるプロジェクトが分かる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);
    await expect(page.getByTestId('workspace-project-name')).toHaveText('alpha');
  });

  test('解決できない projectId は未接続として扱う', async ({ page }) => {
    await page.goto('/projects/NOSUCHPROJECT');
    await expect(page.getByTestId('workspace-unresolved')).toBeVisible();
  });
});

test.describe('プロジェクト概要', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}`);
  });

  test('入場先は概要。いきなり空の一覧に着かない', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('project-row').filter({ hasText: 'alpha' }).getByTestId('project-enter').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}$`));
  });

  test('プロジェクトの素性が出る', async ({ page }) => {
    await expect(page.getByTestId('overview-project-id')).toHaveText(ALPHA);
    await expect(page.getByTestId('overview-project-path')).toContainText('/workspace/alpha');
    await expect(page.getByTestId('overview-version')).toHaveText('2.2.7');
  });

  test('各画面に何件あるかが出る', async ({ page }) => {
    await expect(page.getByTestId('overview-specs')).toContainText('1');
    await expect(page.getByTestId('overview-steering')).toContainText('2');
    await expect(page.getByTestId('overview-approvals')).toContainText('0');
  });

  test('概要から各画面へ入れる', async ({ page }) => {
    await page.getByTestId('overview-specs').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/specs$`));
  });
});

test.describe('仕様書', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('一覧に並ぶ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    await expect(page.getByTestId('record-row')).toHaveCount(1);
    await expect(page.getByTestId('record-row')).toContainText('auth-spec');
  });

  test('仕様書ごとに URL を持つ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    await page.getByTestId('record-row').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/specs/auth-spec$`));
  });

  test('文書は3本に分かれ、それぞれ URL を持つ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec`);

    const rows = page.getByTestId('spec-documents').getByTestId('record-row');
    await expect(rows).toHaveCount(3);
  });

  test('文書の本文を URL で直接開ける', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/requirements`);
    await expect(page.getByTestId('document-content')).toBeVisible();
  });

  test('知らない文書名は開けない', async ({ page }) => {
    const response = await page.goto(`/projects/${ALPHA}/specs/auth-spec/unknown`);
    expect(response?.status()).toBe(404);
  });

  test('編集は置くが、承認の操作は置かない', async ({ page }) => {
    // 文書の編集は入れた（specs/document-editing）。承認への応答は承認画面だけが持つ
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/requirements`);

    await expect(page.getByTestId('document-edit')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(承認|却下)$/ })).toHaveCount(0);
  });

  test('開いた時点では入力欄を出さない', async ({ page }) => {
    // 読みに来ただけの人に編集画面を見せない。編集は押してから入る
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/requirements`);

    await expect(page.locator('textarea')).toHaveCount(0);
  });
});

test.describe('ステアリング', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}/steering`);
  });

  test('3本固定で並び、未作成が分かる', async ({ page }) => {
    const rows = page.getByTestId('steering-list').getByTestId('record-row');

    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'structure.md' })).toContainText('未作成');
  });

  test('未作成の文書は開けない', async ({ page }) => {
    const row = page.getByTestId('record-row').filter({ hasText: 'structure.md' });
    await expect(row).toHaveAttribute('data-disabled', 'true');
  });

  test('ある文書は URL で直接開ける', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering/product`);
    await expect(page.getByTestId('document-content')).toBeVisible();
  });

  test('知らない文書名は開けない', async ({ page }) => {
    const response = await page.goto(`/projects/${ALPHA}/steering/unknown`);
    expect(response?.status()).toBe(404);
  });
});

test.describe('タスク', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('タスクを持つ仕様書が並ぶ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks`);

    await expect(page.getByTestId('record-row')).toHaveCount(1);
    await expect(page.getByTestId('record-row')).toContainText('auth-spec');
  });

  test('仕様書ごとに URL を持つ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks/auth-spec`);

    await expect(page.getByTestId('task-row')).toHaveCount(3);
    await expect(page.getByTestId('tasks-summary')).toContainText('1 / 3 完了');
  });

  test('状態を変える操作は無い', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks/auth-spec`);

    expect(await page.locator('[data-testid="task-row"] button').count()).toBe(0);
    expect(await page.locator('[data-testid="task-row"] input').count()).toBe(0);
  });
});

test.describe('承認', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('0件のときはその旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals`);
    await expect(page.getByTestId('approvals-empty')).toBeVisible();
  });

  test('承認依頼ごとに URL を持つ', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'w1',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await page.goto(`/projects/${ALPHA}/approvals`);
    await page.getByTestId('record-row').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals/w1$`));
  });

  test('対象文書の中身が読める', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'w2',
      title: 'ステアリング: tech.md の承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await page.goto(`/projects/${ALPHA}/approvals/w2`);

    await expect(page.getByTestId('approval-meta')).toContainText('.spec-workflow/steering/tech.md');

    // 対象文書はそのまま直せる状態で開く（specs/document-editing）
    await expect(page.getByTestId('document-input')).toContainText('本文');
  });

  test('既に処理済みの承認依頼はその旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals/gone`);
    await expect(page.getByTestId('approval-resolved')).toBeVisible();
  });
});

/**
 * 承認と却下は本家の `POST /approvals/:id/:action` を呼ぶ。ファイルに書くのは本家で、
 * stroke-board は依頼するだけ（ADR-0001）。
 */
test.describe('承認と却下', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'act1',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(`/projects/${ALPHA}/approvals`);
    await expect(page.getByTestId('record-row')).toHaveCount(1);
  });

  test('承認すると本家へ approve が届き、保留中から消える', async ({ page }) => {
    await page.getByTestId('approval-approve').click();

    await expect(page.getByTestId('approvals-empty')).toBeVisible();

    const { lastApprovalAction } = await stub.stats();
    expect(lastApprovalAction?.action).toBe('approve');
    expect(lastApprovalAction?.id).toBe('act1');
  });

  test('却下は理由を入れてから送る', async ({ page }) => {
    await page.getByTestId('approval-reject').click();
    await expect(page.getByTestId('approval-reject-form')).toBeVisible();

    // 理由が空のうちは送れない
    await expect(page.getByTestId('approval-reject-submit')).toBeDisabled();

    await page.getByTestId('approval-reject-reason').fill('観点が足りない');
    await page.getByTestId('approval-reject-submit').click();

    await expect(page.getByTestId('approvals-empty')).toBeVisible();

    const { lastApprovalAction } = await stub.stats();
    expect(lastApprovalAction?.action).toBe('reject');
    // 理由は本家に応答として残る
    expect(lastApprovalAction?.response).toBe('観点が足りない');
  });

  test('操作を押しても対象の画面へは飛ばない', async ({ page }) => {
    await page.getByTestId('approval-reject').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));
  });
});

test.describe('通知からの導線', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('タスクの通知からその仕様書のタスク画面へ着地する', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').click();

    // 一覧ではなく対象そのものへ着く
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks/auth-spec$`));
    await expect(page.getByTestId('task-row').first()).toBeVisible();
  });

  test('承認依頼の通知からその承認依頼へ着地する', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'nav1',
      title: 'ステアリング: tech.md の承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals/nav1$`));
    await expect(page.getByTestId('document-input')).toBeVisible();
  });

  test('キーボードだけで通知から対象を開ける', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    await page.getByTestId('notification-open').focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks/auth-spec$`));
  });
});

test.describe('未作成の文書は開けない', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('未作成の仕様書文書にはリンクを張らない', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec`);

    const design = page.getByTestId('record-row').filter({ hasText: '設計' });
    await expect(design).toContainText('未作成');
    await expect(design).toHaveAttribute('data-disabled', 'true');
  });

  test('未作成の文書を URL で直接開くと、その旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/design`);
    await expect(page.getByTestId('document-missing')).toBeVisible();
  });
});
