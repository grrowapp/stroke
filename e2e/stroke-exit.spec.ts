import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { PROJECTS_PARENT, SEEDED_PROJECT_NAME, SEEDED_SESSION_ID } from '../playwright.config';

/**
 * 出口の接合（ADR 0011）。
 *
 * ストロークの往復は claude が要るので E2E では回せない。承認の一手前まで進んだ状態を
 * fixture で置き、そこから先——承認 → セッションディレクトリの改名で昇格 → モーダルが
 * 閉じて一覧へ戻る——だけを確かめる。
 *
 * 承認は1回しか成立しない（昇格すると元の id は消える）ので、この spec は1本にまとめて
 * 順に実行する。
 */

test.describe.configure({ mode: 'serial' });

test.describe('承認して一覧へ戻る', () => {
  test('承認するとモーダルが閉じて一覧へ戻り、セッションはプロジェクトへ昇格する', async ({ page }) => {
    await page.goto(`/strokes/${SEEDED_SESSION_ID}/proposal`);

    // 承認の一手前。ストロークの器はモーダルである
    await expect(page.getByTestId('stroke-modal')).toBeVisible();

    // 昇格前: セッションは uuid のディレクトリとして在る
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(false);

    await page.getByRole('button', { name: '承認' }).first().click();

    const dialog = page.getByRole('dialog').filter({ hasText: '承認してプロジェクトを作る' });
    await dialog.getByRole('textbox').fill(SEEDED_PROJECT_NAME);
    await dialog.getByRole('button', { name: '作る' }).click();

    // モーダルごと閉じて一覧へ戻る（ユーザーは steering を待たない）
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId('stroke-modal')).toHaveCount(0);
    await expect(page.getByTestId('projects-table')).toBeVisible();
  });

  test('昇格したプロジェクトは U11 で消せない', async ({ request }) => {
    // 一覧（U12）は昇格後の対象も名前で返す。その名前をそのまま削除に渡せてしまうと、
    // `.spec-workflow/` を含む本物のプロジェクトが消える
    const response = await request.post(`/api/strokes/${SEEDED_PROJECT_NAME}/delete`);

    expect(response.status()).toBe(409);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);
  });

  test('昇格は改名だけで、proposal は同じ相対位置のまま残る', async () => {
    // 新しいディレクトリを作らず、ファイルも動かさない（specs/project/generation）
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, 'docs', 'proposal.md'))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, 'state.json'))).toBe(true);

    // 元のセッションディレクトリは残らない
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID))).toBe(false);

    // `.spec-workflow/` の内部構造には踏み込まない（本家 MCP が作る）
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, '.spec-workflow'))).toBe(false);
  });
});
