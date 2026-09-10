import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { APIRequestContext } from '@playwright/test';

import { APP_PORT, PROJECTS_PARENT } from '../../playwright.config';
import { expect, test } from './support';

/**
 * 承認できる局面が立つのは実行の決着の時点だけである
 * （openspec/specs/agent/invocation・stroke/frontier。change fix-rename-during-running-session）。
 *
 * 直したのは、承認による改名が走っている claude を置き去りにする形である。改名は inode を
 * 保つので、対象で claude が走っている最中に改名すると、その呼び出しは改名先で生き続ける
 * 一方、自分を名乗る id は改名前のままになり、以後の提出はすべて落ちる。**防ぐ手立ては
 * 「実行中は昇格を断る」ではなく、承認できる局面が実行中に立たないことである。**
 *
 * ここはその1本を端から端まで通す。他の spec は段取りを A9（決着）で直接作るが、こちらだけは
 * 実物と同じ順序——claude が提出し、プロセスが終わり、invokeAi が決着する——を子プロセスで
 * 起こして見る。claude の代わりは `fixtures/claude-stub.mjs` で、台本を置いた対象だけが
 * 提出して、終了の合図を受け取るまで終わらない。
 */

test.describe.configure({ mode: 'serial' });

const PROPOSAL_BODY = '# 提案\n\nE2E: 実行の決着で画面2 が開くことを確かめる本文。';

/** 画面に出る一文。出ている／出ていないの判定はこれ1つで行う */
const PROPOSAL_TEXT = 'E2E: 実行の決着で画面2 が開くことを確かめる本文。';

/** スタブとの握り。`fixtures/claude-stub.mjs` と同じ名前を使う */
const SCRIPT_FILE = '.claude-stub.json';
const SUBMITTED_FILE = '.claude-stub-submitted';
const RELEASE_FILE = '.claude-stub-release';

/**
 * 昇格の名前。**走るたびに変える。**
 *
 * 昇格したプロジェクトは名前で保存先に残り、同じ名前で2度目を走らせると名前衝突
 * （409 `name-conflict`）で落ちる。`proposal-persistence.spec.ts` と同じ作法。
 */
const PROJECT_NAME = `e2e-settlement-${Date.now()}`;

/** 本家と同じ式（design.md D13）。昇格したものは workspace のパスが生成先に等しい */
function projectIdOf(name: string): string {
  return createHash('sha1').update(join(PROJECTS_PARENT, name)).digest('base64url').substring(0, 16);
}

/**
 * セッションを作り、claude を起こせる状態にして、台本を置く。
 *
 * `openspec/config.yaml` を自分で置くのは、初回/継続の判定を「継続」に倒すためである。
 * 判定は U12 の一覧に載っているかで行い（`server/utils/stroke/invoke.ts` の
 * `hasConversation`）、載る条件が openspec ルートとスキーマ設定である
 * （`session-core.ts` の `passesListChecks`）。継続なら実行環境の初期化（`openspec init`）が
 * 走らない——E2E に openspec の実体を持ち込まないための段取りで、`playwright.config.ts` の
 * seed が承認済みセッションに同じものを置いているのと同じ理由である。
 */
async function startScriptedSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/strokes', {
    data: { overview: 'E2E: 実行の決着で画面2 が開くことを確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };

  const dir = join(PROJECTS_PARENT, sessionId);
  mkdirSync(join(dir, 'openspec'), { recursive: true });
  writeFileSync(join(dir, 'openspec', 'config.yaml'), 'schema: flontier-strokeflow\n');
  writeFileSync(
    join(dir, SCRIPT_FILE),
    JSON.stringify({ proposal: PROPOSAL_BODY, projectName: PROJECT_NAME }),
  );

  return sessionId;
}

/** U2。局面と実行の状態はここでしか見ない */
async function statusOf(
  request: APIRequestContext,
  id: string,
): Promise<{ phase: string; invocation: string }> {
  const response = await request.get(`/api/strokes/${id}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { phase: string; invocation: string };
}

test.describe('proposal は実行の決着で画面2 を開く', () => {
  let sessionId = '';

  /**
   * 昇格したものを残さない（`proposal-persistence.spec.ts` の後始末と同じ理由）。昇格の直後に
   * 始まる steering の実行が終わっていなくても消せる——削除は実行中かどうかを見ない
   * （openspec/specs/api/project/delete）。**消せなかったら落とす。**
   *
   * `afterAll` はテスト単位の fixture（`request`）を受け取れないので、待ち受けから組み立てて
   * 直接叩く（`ws-disconnect.spec.ts` と同じ作法）。
   */
  test.afterAll(async () => {
    const promoted = existsSync(join(PROJECTS_PARENT, PROJECT_NAME));
    const path = promoted
      ? `/api/projects/${projectIdOf(PROJECT_NAME)}`
      : `/api/sessions/${sessionId}`;

    const response = await fetch(`http://127.0.0.1:${APP_PORT}${path}`, { method: 'DELETE' });
    expect(
      response.ok,
      `後始末が受理されなかった（${path}）: ${response.status} ${await response.text()}`,
    ).toBeTruthy();
  });

  test('提出しただけでは画面2 が開かず、実行の決着で開く', async ({ page, request }) => {
    // 提出の合図待ちと決着待ちが1本に並ぶ。既定の 30 秒では足りない
    test.setTimeout(60_000);

    sessionId = await startScriptedSession(request);
    const dir = join(PROJECTS_PARENT, sessionId);

    // U13。応答が返るのは起動の材料を組み立てたところまでで、claude の完了は待たない
    const started = await request.get(`/api/strokes/${sessionId}/invoke-agent`, {
      params: { cwd: dir },
    });
    expect(started.status(), await started.text()).toBe(200);

    // スタブが A7 へ提出し終えた合図。ここから先、スタブは終了の合図を待って止まっている
    await expect.poll(() => existsSync(join(dir, SUBMITTED_FILE)), { timeout: 15_000 }).toBe(true);

    // **提出は局面を動かさない。** proposal は残っているのに phase は `stroking` のままで、
    // 実行はまだ走っている（openspec/specs/api/stroke/proposal）
    expect(await statusOf(request, sessionId)).toMatchObject({
      phase: 'stroking',
      invocation: 'running',
    });

    // 画面2 の URL を直に開いても proposal は出ない。W2 の接続時配信は phase が `stroking` の
    // 間は何も送らないので、本文も承認の操作も面に立たない
    await page.goto(`/strokes/${sessionId}/proposal`);
    await expect(page.getByText(PROPOSAL_TEXT)).toHaveCount(0);
    await expect(page.getByRole('button', { name: '承認して作る' })).toHaveCount(0);

    // 実行を終わらせる。決着は phase を `proposed` にし、実行を畳んでから終わる
    writeFileSync(join(dir, RELEASE_FILE), '');
    await expect
      .poll(async () => (await statusOf(request, sessionId)).phase, { timeout: 20_000 })
      .toBe('proposed');
    expect((await statusOf(request, sessionId)).invocation).toBe('idle');

    // 同じ URL が画面2 になる。本文は W2 の接続時配信で届く
    await page.goto(`/strokes/${sessionId}/proposal`);
    await expect(page.getByTestId('proposal-preview')).toContainText(PROPOSAL_TEXT);
    await expect(page.getByRole('button', { name: '承認して作る' })).toBeVisible();
  });

  /**
   * **改名の時点で対象に走っている呼び出しが無い。**
   *
   * 昇格（U14）は改名の間だけ実行の枠を取り、取れなければ 500 で落ちる
   * （`server/api/strokes/[id]/promote.post.ts`）。承認できる局面が実行の決着の後にしか
   * 立たないので、その枠は必ず取れる——ここが緑であることが、改名が走っている claude を
   * 置き去りにしないことの担保である。**断り（409 busy）で守っているのではない**ので、
   * 待ち直しも出し直しもここには無い。
   */
  test('決着した後の承認は、走っている呼び出しに邪魔されずに昇格する', async ({ page, request }) => {
    // 承認の前に、対象で何も走っていないことを確かめる。台本もスタブが読んで消している
    expect((await statusOf(request, sessionId)).invocation).toBe('idle');
    expect(existsSync(join(PROJECTS_PARENT, sessionId, SCRIPT_FILE))).toBe(false);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: '承認して作る' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: '承認してプロジェクトを作る' });
    await dialog.getByRole('textbox').fill(PROJECT_NAME);
    await dialog.getByRole('button', { name: '作る' }).click();

    // 昇格が通れば一覧へ戻る。断られていれば昇格の失敗の決着（やり直す／破棄する）が出て留まる
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByTestId('project-creation-choice')).toHaveCount(0);

    // 昇格はセッションディレクトリの改名だけ。提出された proposal はそのまま運ばれる
    expect(existsSync(join(PROJECTS_PARENT, PROJECT_NAME, 'docs', 'proposal.md'))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, sessionId))).toBe(false);
  });
});
