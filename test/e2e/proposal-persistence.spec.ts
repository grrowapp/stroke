import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { APIRequestContext } from '@playwright/test';

import { PROJECTS_PARENT } from '../../playwright.config';
import { expect, settleRun, test } from './support';

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

/** 済んだ（消した・もともと無い）か、断られたか。断られた理由は本文ごと持つ */
type ProjectCleanup = { kind: 'done' } | { kind: 'refused'; detail: string };

/**
 * 昇格したプロジェクトを消す。
 *
 * **待たない。** かつては承認の直後に起こる steering の実行中の削除が busy（409）で断られ、
 * その間だけ出し直していた。削除は実行中かどうかを見なくなったので
 * （openspec/specs/api/project/delete。change fix-rename-during-running-session）、
 * 断られたらそれは busy ではない別の理由であり、待っても通らない。
 *
 * 消す前に名前で在ることを確かめる。無ければ消すものが無い。**在ると確かめた後の 404 は
 * 失敗である**——名前で在るのに `projectId` で見つからないのは、ここで導出した id とサーバの
 * 導出がずれたということで、それを緑で隠さない。
 */
async function deleteProject(request: APIRequestContext, name: string): Promise<ProjectCleanup> {
  const existing = await request.get(`/api/sessions/${encodeURIComponent(name)}`);
  if (existing.status() === 404) return { kind: 'done' };
  if (!existing.ok()) {
    return { kind: 'refused', detail: `状態を読めない: ${existing.status()} ${await existing.text()}` };
  }

  const projectId = createHash('sha1')
    .update(join(PROJECTS_PARENT, name))
    .digest('base64url')
    .substring(0, 16);
  const response = await request.delete(`/api/projects/${encodeURIComponent(projectId)}`);
  if (response.ok()) return { kind: 'done' };

  return { kind: 'refused', detail: `${projectId}: ${response.status()} ${await response.text()}` };
}

async function startSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/sessions', {
    data: { overview: 'E2E: 受理した proposal が残ることを確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };
  return sessionId;
}

/**
 * A7 で proposal の全文を提出し、その実行を決着させる（A9）。
 *
 * 提出だけでは画面2 は開かない（phase は `stroking` のままで、画面1 へ戻される）。承認できる
 * 局面が立つのは実行の決着の時点だけになった（change fix-rename-during-running-session）。
 * ここで見たいのは残った本文が画面へ届くことなので、決着まで進めた状態を段取りとして作る。
 */
async function submitProposal(
  request: APIRequestContext,
  sessionId: string,
  projectName: string,
): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
    data: { proposal: PROPOSAL_BODY, projectName },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await settleRun(request, sessionId, 'proposal');
}

test.describe('受理した proposal は残る', () => {
  let created: string[] = [];
  /**
   * 昇格したものは名前が変わり、セッションの口では消せない。**プロジェクトの口で消す。**
   *
   * 残すと、承認済み（`phase: 'approved'`）で `.spec-workflow` を持たないディレクトリが
   * 保存先に居座る。かつてはそれが**次の実行から一覧に「生成中」として出て**
   * （specs/project/directory）他の spec の行数を狂わせた。いまは実行の開始時に保存先を
   * 丸ごと消す（`playwright.config.ts`）ので次の run には及ばないが、消せなかった事実は
   * この run の結果にしか現れない。
   */
  let promoted: string[] = [];

  /**
   * **後始末の失敗は握り潰さない**（openspec/specs/tooling/e2e-harness）。
   *
   * かつては応答を見ずに捨てていた（`.catch(() => undefined)` は通信エラーしか拾わず、
   * 409 や 404 は誰も見ていなかった）。消せなかったものは次の run の無関係なテスト
   * （`projects.spec.ts` の行数）を落とす形でしか現れず、口が弾いたのか届かなかったのかも
   * 読めない（fix-e2e-project-residue）。受理されなかったら、何を消そうとしてどう断られたかを
   * 載せて**このテストを落とす**。昇格したプロジェクトの扱いは `deleteProject`。
   */
  test.afterEach(async ({ request }) => {
    const refused: string[] = [];

    try {
      for (const name of created) {
        const response = await request.delete(`/api/sessions/${encodeURIComponent(name)}`);
        if (!response.ok()) {
          refused.push(`セッション ${name}: ${response.status()} ${await response.text()}`);
        }
      }

      for (const name of promoted) {
        const outcome = await deleteProject(request, name);
        if (outcome.kind === 'refused') refused.push(`プロジェクト ${name}（${outcome.detail}）`);
      }
    } finally {
      // 要求そのものが失敗（通信断など）しても、次のテストへ古い id を持ち越さない
      created = [];
      promoted = [];
    }

    if (refused.length > 0) {
      throw new Error(`後始末が受理されず、残骸を残した:\n${refused.join('\n')}`);
    }
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
    promoted.push(projectName);

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

    // 受理されていないので、この実行を決着させても画面2 は立たない。断られる理由は `phase`
    // （残っている proposal が無い）で、busy ではない——busy は契約から無くなった
    const settlement = await request.post(`/api/strokes/${sessionId}/settlement`, {
      data: { submitted: 'proposal' },
    });
    expect(settlement.status(), '本文が無いのに決着した').toBe(409);
    expect(((await settlement.json()) as { data?: { reason?: string } }).data?.reason).toBe('phase');

    // phase は進まない。進むと画面2 へ移ってしまい、本文の無いまま承認へ進める
    const state = (await (await request.get(`/api/sessions/${sessionId}`)).json()) as {
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
