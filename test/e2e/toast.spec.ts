import type { Locator, Page } from '@playwright/test';

import { ALPHA, BETA, expect, resetBoard, stub, test } from './support';

/**
 * トースト（specs/notification-toast）。本家と同じ形にする。
 *
 * 描画は @nuxt/ui の `UToaster` / `UToast` が持つので、セレクタは自前の `data-testid` では
 * なく `UToast` が出す構造（`data-slot`）で取る（design.md 決定8）。
 * トースト本体は viewport（`<ol>`）の直下の `<li>` で、その外に出る読み上げ用の
 * 隠しテキスト（reka-ui の ToastAnnounce）は含まれない。
 */

/** 右上に固定される viewport。本家の `fixed top-4 right-4` に当たる */
function toaster(page: Page): Locator {
  return page.locator('ol[data-slot="viewport"]');
}

/** トースト1件 */
function toasts(page: Page): Locator {
  return page.locator('ol[data-slot="viewport"] > li');
}

/** × ボタン */
function dismiss(page: Page): Locator {
  return toasts(page).locator('button[data-slot="close"]');
}

test.describe('通知トースト', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('通知が発生するとトーストが出る', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // 右上に固定されている（本家 `fixed top-4 right-4`）。
    // クラス名ではなく実際の位置で見る。@nuxt/ui の既定は右下なので、設定が効かないと落ちる
    const position = await toaster(page).evaluate((element) => getComputedStyle(element).position);
    expect(position).toBe('fixed');

    const box = await toasts(page).boundingBox();
    const viewport = page.viewportSize();

    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y).toBeLessThan(viewport!.height / 2);
    expect(box!.x + box!.width).toBeGreaterThan(viewport!.width / 2);
  });

  test('複数同時に発生したら縦に積まれる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await stub.completeTask(BETA);

    await expect(toasts(page)).toHaveCount(2);

    // 縦積み: 縦位置がずれる。積み直しに 200ms の遷移が挟まるので落ち着くまで待つ
    await expect
      .poll(async () => {
        const [first, second] = await Promise.all([
          toasts(page).nth(0).boundingBox(),
          toasts(page).nth(1).boundingBox(),
        ]);
        if (first === null || second === null) return 0;
        return Math.abs(second.y - first.y);
      })
      .toBeGreaterThan(0);

    // 横位置は揃う（横に並べない）
    const [first, second] = await Promise.all([
      toasts(page).nth(0).boundingBox(),
      toasts(page).nth(1).boundingBox(),
    ]);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.x).toBeCloseTo(first!.x, 0);
  });

  test('5秒で自動的に消える', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    await expect(toasts(page)).toHaveCount(0, { timeout: 8_000 });
  });

  test('× ボタンで即座に消える', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    await dismiss(page).click();
    await expect(toasts(page)).toHaveCount(0);
  });

  test('× ボタンのラベルは日本語で、どの通知を閉じるかが分かる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // @nuxt/ui の既定は英語 "Close"。通知の件名を添えた日本語に差し替えている。
    // 件名は `タスク完了（n/m）`（server/utils/control/notify.ts）
    await expect(dismiss(page)).toHaveAttribute(
      'aria-label',
      /^タスク完了（\d+\/\d+） の通知を閉じる$/,
    );
  });

  test('タスク完了は success の色になる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // 本家の階調（`bg-green-50 border-green-200 text-green-800`）
    await expect(toasts(page)).toHaveClass(/(^|\s)bg-green-50(\s|$)/);
    await expect(toasts(page)).toHaveClass(/(^|\s)border-green-200(\s|$)/);
  });

  test('承認依頼は info の色になる', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'tone1',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(toasts(page)).toHaveCount(1);

    // 本家の階調（`bg-blue-50 border-blue-200 text-blue-800`）
    await expect(toasts(page)).toHaveClass(/(^|\s)bg-blue-50(\s|$)/);
    await expect(toasts(page)).toHaveClass(/(^|\s)border-blue-200(\s|$)/);
  });

  test('中身は1行のテキストと × だけ', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // 件名と本文の区別（description）も、追加の操作（actions）も持たない
    await expect(toasts(page).locator('[data-slot="title"]')).toHaveCount(1);
    await expect(toasts(page).locator('[data-slot="description"]')).toHaveCount(0);
    await expect(toasts(page).locator('a')).toHaveCount(0);
    await expect(toasts(page).locator('button')).toHaveCount(1);
  });

  test('トーストのテキストを押しても何も起きない', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    await toasts(page).locator('[data-slot="title"]').click();

    await expect(page).toHaveURL(/\/notifications$/);
    await expect(toasts(page)).toHaveCount(1);
  });

  test('トーストが出てもフォーカスは奪われない', async ({ page }) => {
    await page.getByTestId('tab-projects').focus();

    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused).toBe('tab-projects');
  });

  test('× ボタンにキーボードで到達でき、そこで閉じられる', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    await dismiss(page).focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-slot'));
    expect(focused).toBe('close');

    await page.keyboard.press('Enter');
    await expect(toasts(page)).toHaveCount(0);
  });

  test('下層にいてもトーストは出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}`);
    // 画面を移ると WebSocket を張り直すので、繋がるまで待ってから起こす
    await expect(page.getByTestId('workspace-connection')).toHaveAttribute('data-connected', 'true');

    await stub.completeTask(BETA);

    await expect(toasts(page)).toHaveCount(1);
  });

  test('画面を開き直しても過去分はトーストにならない', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId('notification-row')).toHaveCount(1);
    await expect(toasts(page)).toHaveCount(0);
  });
});
