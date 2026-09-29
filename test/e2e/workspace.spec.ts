import type { Locator, Page } from '@playwright/test';

import { ALPHA, expect, resetBoard, stub, test } from './support';

/**
 * `RecordList` の行。
 *
 * `UTable` の `tr` には任意の属性を張れないため、行の目印は class になる
 * （押せる行は `.sb-datarow`、押せない行は `.sb-datarow-off`）。
 * `record-row` は `ApprovalCard` も名乗るので、そちらとは別に指す。
 */
function recordRows(scope: Page | Locator): Locator {
  return scope.locator('tr.sb-datarow, tr.sb-datarow-off');
}

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
    await page.goto('/notifications');
    await expect(page.getByTestId('tab-notifications')).toBeVisible();
    await expect(page.getByTestId('workspace-sidebar')).toHaveCount(0);

    await page.goto(`/projects/${ALPHA}`);
    await expect(page.getByTestId('workspace-sidebar')).toBeVisible();
    await expect(page.getByTestId('tab-notifications')).toHaveCount(0);
  });

  test('ヘッダー左からポータルへ戻れる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);
    await page.getByTestId('back-to-portal').click();

    await expect(page).toHaveURL(/\/projects$/);
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

  /**
   * 本家（PageNavigationSidebar）は畳んでもサイドバーを消さず、`lg:w-16`＝64px の帯にして
   * アイコンだけ残す。開き直すボタンも同じ場所（帯の一番上）に残る。
   * 開いた幅は本家の `lg:w-64`＝256px（値の出どころは main.css の `.sb-sidebar`）。
   */
  test('サイドバーを畳むと帯になり、畳んだまま行き先を選べる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);

    const sidebar = page.getByTestId('workspace-sidebar');
    await expect(sidebar).toHaveCSS('width', '256px');

    await page.getByTestId('sidebar-collapse').click();
    await expect(sidebar).toHaveCSS('width', '64px');

    // ラベルは落ちるが、項目そのものは押せるまま残る
    const items = await page.locator('[data-testid="workspace-sidebar"] a').allTextContents();
    expect(items.map((item) => item.trim())).toEqual(['', '', '', '', '']);
    await expect(page.getByTestId('sidebar-tasks')).toHaveAttribute('title', 'タスク');

    await page.getByTestId('sidebar-tasks').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/tasks$`));
    await expect(sidebar).toHaveCSS('width', '64px');
  });

  /**
   * 本家は畳んでも項目のアイコンを落とさない（落ちるのはラベルの `<span>` だけ）。
   * 開いているときも絵は出ている。畳んだ瞬間に別の部品に見えないための形。
   */
  test('項目のアイコンは開いていても畳んでいても出ている', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);

    const icons = page.locator('[data-testid="workspace-sidebar"] a svg');
    await expect(icons).toHaveCount(5);

    await page.getByTestId('sidebar-collapse').click();
    await expect(icons).toHaveCount(5);
  });

  test('畳んだサイドバーは同じボタンで開き直せる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);

    const sidebar = page.getByTestId('workspace-sidebar');
    const toggle = page.getByTestId('sidebar-collapse');

    await toggle.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    await expect(toggle).toHaveAttribute('aria-label', 'サイドバーを開く');

    await toggle.click();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await expect(sidebar).toHaveCSS('width', '256px');

    const items = await page.locator('[data-testid="workspace-sidebar"] a').allTextContents();
    expect(items.map((item) => item.trim())).toEqual([
      '概要',
      'Feature',
      'ステアリング',
      'タスク',
      '承認',
    ]);
  });

  /**
   * 本家は localStorage の `spec-workflow-sidebar-collapsed` に持つ（App.tsx）が、本家は
   * CSR だけで動くので初回描画の前に読める。stroke-board は SSR があり localStorage を
   * サーバで読めないため、同じキーの cookie に持つ（理由は `workspace.vue`）。
   *
   * 見たいのは保存先ではなく挙動: 読み込み直しても畳んだままで、**開いた形を一度も
   * 見せない**（サーバが返す HTML の時点で畳んでいる）。
   */
  test('畳んだ状態は読み込み直しても残り、途中で開いた形を見せない', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);
    await page.getByTestId('sidebar-collapse').click();

    await expect
      .poll(async () =>
        (await page.context().cookies()).find(
          (cookie) => cookie.name === 'spec-workflow-sidebar-collapsed',
        )?.value,
      )
      .toBe('true');

    // サーバが返す HTML の時点で畳んでいる（ちらつきの元になる開いた形を通らない）
    const html = await (await page.request.get(`/projects/${ALPHA}`)).text();
    expect(html).toContain('data-collapsed="true"');

    await page.reload();
    await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute('data-collapsed', 'true');
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

    await expect(recordRows(page)).toHaveCount(1);
    await expect(recordRows(page)).toContainText('auth-spec');
  });

  test('仕様書ごとに URL を持つ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);
    await recordRows(page).click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/specs/auth-spec$`));
  });

  /**
   * 行のどこを押しても開くのは本家と同じ（`SpecsPage.tsx` の `SpecTableRow` は
   * `tr` に onClick を持つ）。stroke-board は行に押す面を持たせる代わりに、行の中の
   * リンクを行いっぱいに広げている。「行の端を押す」と「リンクを辿る」の両方を見る。
   */
  test('行の端を押しても開き、リンクはキーボードでも辿れる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    // 名前から一番遠い列（操作）の上を押す
    const row = recordRows(page).first();
    const rowBox = (await row.boundingBox())!;
    const lastCell = (await row.locator('td').last().boundingBox())!;

    await row.click({
      position: {
        x: lastCell.x + lastCell.width / 2 - rowBox.x,
        y: lastCell.y + lastCell.height / 2 - rowBox.y,
      },
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/specs/auth-spec$`));

    await page.goto(`/projects/${ALPHA}/specs`);

    await page.getByTestId('specs-list').getByTestId('record-open').first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/specs/auth-spec$`));
  });

  /**
   * `UTable` に `onSelect` を渡すと `tr` に `role="button"` と `tabindex="0"` が付くが、
   * `UTable` は keydown を持たないので Enter では開けない。本家の `tr` も tabindex を
   * 持たない。行そのものはタブ順に入れず、タブストップは行あたり1つ（リンク）にする。
   */
  test('タブストップは行あたり1つで、行そのものはタブ順に入らない', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec`);

    const rows = recordRows(page.getByTestId('spec-documents'));

    await expect(rows.first()).not.toHaveAttribute('tabindex');
    await expect(rows.first()).not.toHaveAttribute('role');
    await expect(rows.first().locator('a, button, [tabindex]')).toHaveCount(1);
  });

  test('文書は3本に分かれ、それぞれ URL を持つ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec`);

    const rows = recordRows(page.getByTestId('spec-documents'));
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
    const rows = recordRows(page.getByTestId('steering-list'));

    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: 'structure.md' })).toContainText('未作成');
  });

  test('未作成の文書は開けない', async ({ page }) => {
    const row = recordRows(page).filter({ hasText: 'structure.md' });

    await expect(row).toHaveClass(/sb-datarow-off/);
    await expect(row.getByTestId('record-open')).toHaveCount(0);
  });

  /** 開けない行に止まるタブストップを作らない。行にも中身にもフォーカスを置かない */
  test('未作成の文書の行はフォーカスを受けない', async ({ page }) => {
    const row = recordRows(page).filter({ hasText: 'structure.md' });

    await expect(row).not.toHaveAttribute('tabindex');
    await expect(row).not.toHaveAttribute('role');
    await expect(row.locator('a, button, [tabindex]')).toHaveCount(0);

    // 前の行のリンクから Tab で進んでも、この行を飛ばして次の行のリンクへ行く
    await recordRows(page).filter({ hasText: 'tech.md' }).getByTestId('record-open').focus();
    await page.keyboard.press('Tab');

    await expect(row.locator(':focus')).toHaveCount(0);
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

    await expect(recordRows(page)).toHaveCount(1);
    await expect(recordRows(page)).toContainText('auth-spec');
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

    // 承認は読んで判断する場なので、整形して出る。編集の口は無い
    // （specs/document-editing・`ApprovalAnnotator` の preview 面）
    await expect(page.getByTestId('document-content')).toContainText('本文');
    await expect(page.getByTestId('document-edit')).toHaveCount(0);
  });

  test('既に処理済みの承認依頼はその旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals/gone`);
    await expect(page.getByTestId('approval-resolved')).toBeVisible();
  });
});

/**
 * 承認と却下は本家の `POST /approvals/:id/:action` を呼ぶ。ファイルに書くのは本家で、
 * stroke-board は依頼するだけ（ADR-0005）。
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
    // 着地先は承認画面の preview 面。対象文書は整形して出る
    await expect(page.getByTestId('document-content')).toBeVisible();
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

    const design = recordRows(page).filter({ hasText: '設計' });
    await expect(design).toContainText('未作成');
    await expect(design).toHaveClass(/sb-datarow-off/);
    await expect(design.getByTestId('record-open')).toHaveCount(0);
  });

  test('未作成の文書を URL で直接開くと、その旨が出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/design`);
    await expect(page.getByTestId('document-missing')).toBeVisible();
  });
});
