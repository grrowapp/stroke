import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { PROJECTS_PARENT } from '../../playwright.config';

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

/**
 * 後始末の削除が busy で断られる間、出し直しを続ける上限。
 *
 * E2E の steering は `/bin/true`（`playwright.config.ts`）で、起動から終了まで 200ms に満たない。
 * 巡回（60秒ごと）が起こし直した直後に重なっても、この上限の中で終わる。
 */
const STEERING_SETTLE_TIMEOUT_MS = 5_000;
const STEERING_POLL_INTERVAL_MS = 100;

/** 済んだ（消した・もともと無い）か、断られたか。断られた理由は本文ごと持つ */
type ProjectCleanup = { kind: 'done' } | { kind: 'refused'; detail: string };

/** 削除口が「AI の応答を待っている」で断った応答か（`server/utils/stroke/conflict.ts` の形） */
function isBusyRefusal(status: number, body: string): boolean {
  if (status !== 409) return false;
  try {
    return (JSON.parse(body) as { data?: { reason?: string } }).data?.reason === 'busy';
  } catch {
    return false;
  }
}

/**
 * 昇格したプロジェクトを消す。busy の間だけ待つ。
 *
 * 承認の画面は昇格の直後に steering を起こす（ADR 0011）。その実行中の削除は busy（409）で
 * 断られる（実測 2026-09-06）。**観測点はサーバ自身の busy 判定にする**——`state.json` の
 * `invocation` は起動より遅れて書かれ（`running` の集合に入ってから A8 で書くまでの間は昇格時の
 * `failed` のまま）、しかも afterEach の時点では画面がまだ起動を要求していないこともあるので、
 * それを見て「終わった」と読むと直後の DELETE が busy で断られる。
 *
 * 消す前に名前で在ることを確かめる。無ければ消すものが無い。**在ると確かめた後の 404 は
 * 失敗である**——名前で在るのに `projectId` で見つからないのは、ここで導出した id とサーバの
 * 導出がずれたということで、それを緑で隠さない。
 */
async function deleteProjectWhenSettled(request: APIRequestContext, name: string): Promise<ProjectCleanup> {
  const existing = await request.get(`/api/strokes/${encodeURIComponent(name)}`);
  if (existing.status() === 404) return { kind: 'done' };
  if (!existing.ok()) {
    return { kind: 'refused', detail: `状態を読めない: ${existing.status()} ${await existing.text()}` };
  }

  const projectId = createHash('sha1')
    .update(join(PROJECTS_PARENT, name))
    .digest('base64url')
    .substring(0, 16);
  const deadline = Date.now() + STEERING_SETTLE_TIMEOUT_MS;
  for (;;) {
    const response = await request.delete(`/api/projects/${encodeURIComponent(projectId)}`);
    if (response.ok()) return { kind: 'done' };

    const body = await response.text();
    const refusal = `${response.status()} ${body}`;
    if (!isBusyRefusal(response.status(), body)) return { kind: 'refused', detail: `${projectId}: ${refusal}` };
    if (Date.now() >= deadline) {
      return {
        kind: 'refused',
        detail: `${projectId}: steering の実行が ${STEERING_SETTLE_TIMEOUT_MS}ms 以内に終わらない。最後の応答: ${refusal}`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, STEERING_POLL_INTERVAL_MS));
  }
}

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
   * 載せて**このテストを落とす**。昇格したプロジェクトの扱いは `deleteProjectWhenSettled`。
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
        const outcome = await deleteProjectWhenSettled(request, name);
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
