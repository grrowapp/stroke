import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECTS_PARENT } from '../../playwright.config';
import { ALPHA, expect, test } from './support';

/**
 * 許可による画面の絞り込み（access/permission・access/user-management・
 * docs/specs/architecture/screen-flow.md「見られない対象の URL は 404」）。
 *
 * E2E のブラウザは token を持たず 127.0.0.1 から繋ぐ。`access.json` が無いあいだは
 * `runtimeConfig.access.admins` の初期値（127.0.0.1/32 を含む）で管理者になる。一般の利用者の
 * 画面は、`access.json` に空の管理者の登録を置いて、その接続を管理者でなくして確かめる。
 */

const ACCESS_DIR = join(PROJECTS_PARENT, '.stroke-board');
const ACCESS_FILE = join(ACCESS_DIR, 'access.json');

function writeAccess(content: unknown): void {
  mkdirSync(ACCESS_DIR, { recursive: true });
  writeFileSync(ACCESS_FILE, JSON.stringify(content));
}

test.afterEach(() => {
  rmSync(ACCESS_FILE, { force: true });
});

test.describe('管理者', () => {
  test('一覧の上部にユーザー管理の入口が出て、押すと /admin/users が開く', async ({ page }) => {
    await page.goto('/projects');
    await page.getByTestId('user-management-link').click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByTestId('user-management')).toBeVisible();
  });

  test('利用者を足して許可を付け、保存すると access.json に残る', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByPlaceholder('guest@example.com').fill('Guest@Example.com');
    await page.getByTestId('user-add').click();

    const row = page.getByTestId('user-row').filter({ hasText: 'guest@example.com' });
    await row.getByLabel('alpha').click();
    await page.getByTestId('access-save').click();
    await expect(page.getByTestId('access-save-message')).toHaveText('保存した。');

    const saved = JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) as { users: Record<string, string[]> };
    expect(saved.users).toEqual({ 'guest@example.com': ['alpha'] });
  });
});

test.describe('一般の利用者', () => {
  test.beforeEach(() => {
    // 127.0.0.1 を管理者の接続元から外す。token も無いので、どのプロジェクトにも許可が無い
    writeAccess({ users: {}, admins: { emails: [], networks: [], hosts: [] } });
  });

  test('プロジェクトは一覧に出ず、ユーザー管理の入口も出ない', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await expect(page.getByTestId('project-row')).toHaveCount(0);
    await expect(page.getByTestId('user-management-link')).toHaveCount(0);
  });

  test('/admin/users は 404', async ({ page }) => {
    const response = await page.goto('/admin/users');

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('user-management')).toHaveCount(0);
  });

  test('許可の無いプロジェクトの URL は 404。別の URL へは移らない', async ({ page }) => {
    const response = await page.goto(`/projects/${ALPHA}`);

    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}$`));
  });

});
