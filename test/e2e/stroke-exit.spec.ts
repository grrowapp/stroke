import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { PROJECTS_PARENT, SEEDED_PROJECT_NAME, SEEDED_SESSION_ID } from '../../playwright.config';

/** 本家と同じ式で導く（design.md D13）。承認で作ったものは workspace のパスが生成先に等しい */
const SEEDED_PROJECT_ID = createHash('sha1')
  .update(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))
  .digest('base64url')
  .substring(0, 16);

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
  /**
   * 昇格したものを残さない。
   *
   * 承認済み（`phase: 'approved'`）で `.spec-workflow` を持たないディレクトリが保存先に
   * 居座ると、**次の実行から一覧に「生成中」として出る**（specs/project/directory）。
   * それが他の spec の行数を狂わせる。この spec の中では `.spec-workflow` を作る回が
   * あるので、消す前にディレクトリごと落とす。
   */
  test.afterAll(async () => {
    await rm(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME), { recursive: true, force: true });
  });

  /**
   * 承認の判断・昇格・起動は別々の段である（openspec/specs/api/session/approve・
   * api/session/promote）。判断だけを送って止めると**プロジェクトは作られず**、判断は
   * 昇格の前なら取り下げられる。画面の承認（次のテスト）はこの3段を順に踏む。
   */
  test('承認の判断だけではプロジェクトにならず、昇格の前なら取り下げられる', async ({ request }) => {
    const approve = `/api/strokes/${SEEDED_SESSION_ID}/approve`;

    // 段1: 判断を記録する。ディレクトリは改名されず、phase も動かない
    const decided = await request.post(approve, { data: { projectName: SEEDED_PROJECT_NAME } });
    expect(decided.status()).toBe(204);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(false);
    const status = (await (await request.get(`/api/strokes/${SEEDED_SESSION_ID}`)).json()) as { phase: string };
    expect(status.phase).toBe('proposed');

    // プロジェクト一覧には生成中としても現れない
    const { directory } = (await (await request.get('/api/projects')).json()) as {
      directory: { status: string; projects?: Array<{ name: string }> };
    };
    expect(directory.status).toBe('ok');
    expect((directory.projects ?? []).some((project) => project.name === SEEDED_PROJECT_NAME)).toBe(false);

    // 重ねて判断は下せない。記録されている判断はそのまま
    const again = await request.post(approve, { data: { projectName: 'another-name' } });
    expect(again.status()).toBe(409);

    // 取り下げる。proposal も往復の記録も残る
    const cancelled = await request.delete(approve);
    expect(cancelled.status()).toBe(204);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID, 'docs', 'proposal.md'))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID, 'strokes.json'))).toBe(true);

    // 判断が無ければ昇格は受理されない。承認が唯一の引き金
    const refused = await request.post(`/api/strokes/${SEEDED_SESSION_ID}/promote`);
    expect(refused.status()).toBe(409);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(false);

    // 取り消しは GET では到達しない（メソッドで振り分ける）
    const read = await request.get(approve);
    expect(read.ok(), 'GET が受理された').toBeFalsy();
  });

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

    // 画面は判断（U10）→ 昇格（U14）→ 起動（U13）を順に踏む。判断だけで止まると一覧へは
    // 戻れてもプロジェクトは無い（上のテスト）ので、昇格まで済んだことをここで見る
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID))).toBe(false);
  });

  test('昇格したプロジェクトは U11 で消せない', async ({ request }) => {
    // 一覧（U12）は昇格後の対象も名前で返す。その名前をそのまま削除に渡せてしまうと、
    // `.spec-workflow/` を含む本物のプロジェクトが消える
    const response = await request.delete(`/api/sessions/${SEEDED_PROJECT_NAME}`);

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

  /**
   * 承認した直後から一覧に出る（specs/project/generation）。
   *
   * 上の承認で `promoted-project` が昇格し、`.spec-workflow/` はまだ無い。steering は
   * E2E では走らないので、この状態が続く。
   */
  test('生成中のプロジェクトが一覧の最下部に出る', async ({ page }) => {
    await page.goto('/projects');

    const rows = page.getByTestId('project-row');
    const names = await rows.evaluateAll((all) => all.map((row) => row.getAttribute('data-name')));

    // アクティブ → 未接続 → 生成中。生成中は常に最下部
    expect(names.at(-1)).toBe(SEEDED_PROJECT_NAME);

    const creating = rows.filter({ hasText: SEEDED_PROJECT_NAME });
    await expect(creating).toHaveAttribute('data-creation', 'in-progress');
    await expect(creating).toHaveClass(/sb-row-creating/);
    await expect(creating.getByTestId('project-creating-spinner')).toBeVisible();
    await expect(creating).toContainText('生成中');
  });

  test('生成中の行は押せず、キーボードのフォーカスも受けない', async ({ page }) => {
    await page.goto('/projects');

    const creating = page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME });

    await expect(creating.getByTestId('project-enter')).toHaveCount(0);
    await expect(creating.getByTestId('project-name-disabled')).toBeVisible();
    expect(await creating.locator('button, a, [tabindex]').count()).toBe(0);
  });

  test('生成中は本家から取れる値を出さない。取れないことが分かる表示にする', async ({ page }) => {
    await page.goto('/projects');

    const creating = page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME });

    // PID は出ない。承認の時刻などで最終更新を埋めない
    await expect(creating.getByTestId('project-pid')).toHaveCount(0);
    await expect(creating.getByTestId('project-last-modified')).toHaveText('—');
    await expect(creating.getByTestId('project-unread')).toHaveText('—');
  });

  /**
   * 何も起きていない間に、画面からサーバへの繰り返しの取得が起きない
   * （specs/project/generation「生成の進行は、開いている一覧へ届く」）。
   */
  test('生成中の行があっても、一覧を繰り返し取りに行かない', async ({ page }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/projects') requests += 1;
    });

    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();

    const afterLoad = requests;
    await page.waitForTimeout(3_000);

    expect(requests).toBe(afterLoad);
  });

  /**
   * 完了が届くと、生成中の表現が外れて一度だけ祝う（specs/project/generation）。
   *
   * 完了の実体は「`.spec-workflow/` が在り、実行が終わっている」ことである（design.md D7）。
   * steering は E2E では走らないので、両方を手で起こす——ディレクトリを作り、A8 で
   * `invocation` を `idle` に戻す。A8 は invokeAi が叩く口そのものである。
   */
  test('完了が届くと通常の行に変わり、知らせてから選ばせる', async ({ page, request }) => {
    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();

    mkdirSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, '.spec-workflow'), { recursive: true });

    const response = await request.post(`/api/strokes/${SEEDED_PROJECT_NAME}/submission`, {
      data: { invocation: 'idle' },
    });
    expect(response.ok()).toBe(true);

    // まず知らせる面。行の中ではなく、一覧の上に浮く
    const notice = page.getByTestId('project-creation-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('data-project', SEEDED_PROJECT_NAME);
    await expect(notice).toHaveAttribute('data-outcome', 'done');
    await expect(notice).toContainText(`プロジェクト ${SEEDED_PROJECT_NAME} の作成が完了しました！`);

    // 生成中の表現が外れる。再読み込みは要らない
    const row = page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME });
    await expect(row).toHaveAttribute('data-creation', 'done');
    await expect(row).not.toHaveClass(/sb-row-creating/);
    await expect(row.getByTestId('project-creating-spinner')).toHaveCount(0);

    // 知らせる面は自ら引く。操作を求めない
    await expect(notice).toHaveCount(0, { timeout: 10_000 });

    // 引いた後に、次を選ばせるモーダルが出る
    const choice = page.getByTestId('project-creation-choice');
    await expect(choice).toBeVisible();
    await expect(choice).toContainText('ステアリングの結果をレビューしますか？');

    // **選ぶまで閉じない。** 放っておいても残る
    await page.waitForTimeout(2_000);
    await expect(choice).toBeVisible();

    await page.getByTestId('project-creation-dismiss').click();
    await expect(choice).toHaveCount(0);
    // 画面は遷移しない
    await expect(page).toHaveURL(/\/projects$/);
  });

  test('開き直しても決着は出ない。決着の瞬間を受けた画面にだけ', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();

    await expect(page.getByTestId('project-creation-notice')).toHaveCount(0);
    await expect(page.getByTestId('project-creation-choice')).toHaveCount(0);

    // 行は完了したものとして出ている
    const row = page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME });
    await expect(row).toHaveAttribute('data-creation', 'done');
  });

  /**
   * 削除はメソッドで振り分ける（specs/api/project/delete・specs/api/session/delete）。
   *
   * パスに動詞を置かない形にしたので、**`GET` では何も起きない**ことが契約になる。
   */
  test('削除は DELETE でだけ通り、GET では消えない', async ({ request }) => {
    const path = `/api/projects/${SEEDED_PROJECT_ID}`;

    // `GET` の口は無い。パスに動詞を置かない形にしたので、**メソッドが違えば届かない**
    const read = await request.get(path);
    expect(read.ok(), 'GET が受理された').toBeFalsy();
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);

    // 中身のある本物のプロジェクトは、この口では消えない
    const refused = await request.delete(path);
    expect(refused.status()).toBe(409);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);
  });
});
