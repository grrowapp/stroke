import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { PROJECTS_PARENT, REGISTRY_PATH, registryContent } from '../playwright.config';
import { resetBoard } from './support';

/**
 * 本家が動いていない状態・プロジェクトが0件の状態でも画面が壊れないこと（tasks.md 8.4）。
 *
 * 本家は利用者が別途起動する前提なので、起動していない状態は異常ではなく普通に起こる
 * （specs/upstream-connection）。
 */
test.describe('本家が繋がっていない状態', () => {
  test.afterEach(async () => {
    writeFileSync(REGISTRY_PATH, registryContent());
  });

  test('アクティブが1件も無くても画面は出る', async ({ page }) => {
    writeFileSync(REGISTRY_PATH, '{}');
    await page.goto('/projects');

    await expect(page.getByTestId('projects-table')).toBeVisible();

    const connections = await page.getByTestId('project-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-connection')),
    );

    expect(connections.every((connection) => connection === 'disconnected')).toBe(true);
  });

  test('アクティブが1件も無ければどの行も選べない', async ({ page }) => {
    writeFileSync(REGISTRY_PATH, '{}');
    await page.goto('/projects');

    await expect(page.getByTestId('project-enter')).toHaveCount(0);
  });

  test('本家が繋がっていなくても通知画面は出る', async ({ page }) => {
    writeFileSync(REGISTRY_PATH, '{}');
    await page.goto('/');

    await expect(page.getByTestId('notifications-empty')).toBeVisible();
    await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'false');
  });

  test('本家が戻れば接続状態も戻る', async ({ page }) => {
    writeFileSync(REGISTRY_PATH, '{}');
    await page.goto('/');
    await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'false');

    writeFileSync(REGISTRY_PATH, registryContent());
    await expect(page.getByTestId('upstream-connection')).toHaveAttribute('data-connected', 'true');
  });

  test('監視対象から外れたプロジェクトの通知は一覧から落ちる', async ({ page }) => {
    await resetBoard(page);

    const { stub, ALPHA } = await import('./support');
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('notification-row')).toHaveCount(1);

    writeFileSync(REGISTRY_PATH, '{}');

    await expect(page.getByTestId('notification-row')).toHaveCount(0);
  });
});

test.describe('プロジェクトが0件の状態', () => {
  test('親パスの配下に .spec-workflow を持つディレクトリが無ければその旨が出る', async ({ page }) => {
    // 走査対象が1つも無い親パスを指すインスタンスは別に立てられないので、
    // 走査の空振りはユニットテスト側（scan.test.ts）で押さえてある。
    // ここでは一覧が空でも画面が壊れないことだけを見る。
    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();
    expect(PROJECTS_PARENT.length).toBeGreaterThan(0);
  });
});
