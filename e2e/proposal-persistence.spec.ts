import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { PROJECTS_PARENT } from '../playwright.config';

/**
 * 受理した proposal は残る（openspec/specs/api/stroke/proposal）。
 *
 * 既存の `stroke-exit.spec.ts` は `playwright.config.ts` が seed した `docs/proposal.md` を
 * 前提に動くので、A7 が本文を受け取ってから残るまでの経路を一度も通らない。ここは
 * seed を使わず、セッションの作成と提出を実際に行って、その後に繋いだ画面へ届くかを見る。
 *
 * **提出の瞬間には繋がない。** 受理してから繋ぐ順序が、実際に壊れていた形である
 * （提出時の配信はメモリ上の接続にしか届かず、繋ぎ直すと二度と出なかった）。
 */

const PROPOSAL_BODY = '# 提案\n\nE2E: 受理した proposal が残ることを確かめる本文。';

async function startSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/strokes', {
    data: { overview: 'E2E: 受理した proposal が残ることを確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };
  return sessionId;
}

/** A7: proposal の全文を提出する */
async function submitProposal(
  request: APIRequestContext,
  sessionId: string,
  projectName: string,
): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
    data: { proposal: PROPOSAL_BODY, projectName },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe('受理した proposal は残る', () => {
  let created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const name of created) {
      await request.post(`/api/strokes/${name}/delete`).catch(() => undefined);
    }
    created = [];
  });

  test('提出した後に繋いだ画面へ proposal が届く', async ({ page, request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);

    // 誰も繋いでいない状態で受理させる。ここが壊れていた形
    await submitProposal(request, sessionId, 'e2e-proposal-persists');

    await page.goto(`/strokes/${sessionId}/proposal`);

    await expect(page.getByText('E2E: 受理した proposal が残ることを確かめる本文。')).toBeVisible();
    await expect(page.getByText('まだ proposal はありません')).toHaveCount(0);
  });

  test('承認は proposal が無いことを理由に拒まない', async ({ page, request }) => {
    const sessionId = await startSession(request);

    // 昇格したプロジェクトは U11 で消せない（`stroke-exit.spec.ts` が確かめている仕様）。
    // 固定名にすると2回目の実行が名前衝突で落ちるので、走るたびに違う名前を使う。
    const projectName = `e2e-proposal-approved-${Date.now()}`;

    await submitProposal(request, sessionId, projectName);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: '承認して作る' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill(projectName);
    await dialog.getByRole('button', { name: '作る' }).click();

    await expect(page.getByText('承認済みです')).toBeVisible();
    expect(existsSync(join(PROJECTS_PARENT, projectName, 'docs', 'proposal.md'))).toBe(true);
  });

  test('残せなければ受理しない', async ({ request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);

    // `docs` を**ファイル**にしておく。同じ名前のディレクトリは作れないので、
    // 受理しようとした proposal を残せない状態になる
    writeFileSync(join(PROJECTS_PARENT, sessionId, 'docs'), 'これはディレクトリではない');

    const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
      data: { proposal: '# 残せない\n\n本文。', projectName: 'e2e-proposal-unwritable' },
    });
    expect(response.ok(), '残せないのに受理された').toBeFalsy();

    // phase は進まない。進むと画面2 へ移ってしまい、本文の無いまま承認へ進める
    const state = (await (await request.get(`/api/strokes/${sessionId}`)).json()) as {
      phase: string;
    };
    expect(state.phase).toBe('stroking');
  });

  test('出し直すと最後の1件だけが残る', async ({ page, request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);

    await submitProposal(request, sessionId, 'e2e-proposal-revised');
    const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
      data: { proposal: '# 出し直し\n\n二度目の本文。', projectName: 'e2e-proposal-revised' },
    });
    expect(response.ok(), await response.text()).toBeTruthy();

    await page.goto(`/strokes/${sessionId}/proposal`);

    await expect(page.getByText('二度目の本文。')).toBeVisible();
    await expect(page.getByText('E2E: 受理した proposal が残ることを確かめる本文。')).toHaveCount(0);
  });
});
