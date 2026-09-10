import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
   * 昇格したディレクトリが保存先に居座ると、**次の実行から一覧に出る**
   * （specs/project/directory）。それが他の spec の行数を狂わせる。この spec の中では
   * `.spec-workflow` を作り、完成まで記録する回があるので、消す前にディレクトリごと落とす。
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
    const approve = `/api/sessions/${SEEDED_SESSION_ID}/approve`;

    // 段1: 判断を記録する。ディレクトリは改名されず、phase も動かない
    const decided = await request.post(approve, { data: { projectName: SEEDED_PROJECT_NAME } });
    expect(decided.status()).toBe(204);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_SESSION_ID))).toBe(true);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(false);
    const status = (await (await request.get(`/api/sessions/${SEEDED_SESSION_ID}`)).json()) as { phase: string };
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
    const refused = await request.post(`/api/sessions/${SEEDED_SESSION_ID}/promote`);
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

    // `.spec-workflow/` の内部構造には踏み込まない（生成の依頼を受けた本家が作る。スタブは作らない）
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, '.spec-workflow'))).toBe(false);
  });

  /**
   * 生成は本家への登録の依頼であり、AI の起動ではない（specs/project/generation・
   * specs/agent/invocation。change `update-project-generation-via-upstream-rest`）。
   *
   * 昇格の成功を見た画面が U13 を叩き、その起動の材料の組み立てが AI を起動する前に P2
   * （`POST /api/projects`）で本家へ登録を依頼する。claude は `/bin/true` に差し替えてあるので、
   * 登録がスタブに届いたなら、それは P2 から来たものである。
   */
  test('承認して起動が要求されると、本家に昇格先のパスで登録が依頼される', async () => {
    const { stub } = await import('./support');

    // 画面の起動要求（U13）は昇格の応答の後に飛ぶ。画面は応答を待たずに一覧へ戻るので、
    // 依頼がスタブへ届くまで待って見る。件数を固定しないのは、巡回（60秒ごと）が `failed` の
    // 対象を起こし直すたびに依頼が1件増えるためで、届いた依頼がすべて昇格先のパスであることを見る
    await expect
      .poll(async () => (await stub.stats()).registrations.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    const { registrations } = await stub.stats();
    expect(registrations.every((entry) => entry.projectPath === join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);
  });

  /**
   * **AI の起動はプロジェクトを生成しない**（削除の検証。design D6）。
   *
   * 本家が登録を受け付けない間に起動を要求すると、起動の材料を組み立てられず（503）、AI は
   * 起動されず `invocation` は `failed` になる。登録は増えない。生成が受理されなければ AI は
   * 起動されないので、起動定義に並ぶ本家 MCP が自己登録する機会は無い——受け付けるように
   * なった後の起動で、P2 からの登録が1件増えるだけである。
   */
  test('本家が登録を受け付けなければ起動は 503 で止まり、登録は増えない', async ({ request }) => {
    const { stub } = await import('./support');
    const target = `/api/sessions/${SEEDED_PROJECT_NAME}`;
    const cwd = join(PROJECTS_PARENT, SEEDED_PROJECT_NAME);

    type Status = { invocation: string };
    const readStatus = async (): Promise<Status> => (await (await request.get(target)).json()) as Status;
    // 起こし直しの回数は U2 の応答に無い（契約は phase / invocation / path）。`state.json` を直接読む
    const readRetries = (): number =>
      (JSON.parse(readFileSync(join(cwd, 'state.json'), 'utf8')) as { retries?: number }).retries ?? 0;

    // **先に断る状態にしてから基準を取る。** 巡回（60秒ごと。`server/plugins/01.retry-failed.ts`）が
    // `failed` の対象を起こし直すので、受け付ける状態で基準を取ると、その隙に登録が1件増えうる。
    // 断っている間はどの起動要求も登録を増やさない（スタブは断った依頼を数えない）ので、基準が安定する
    await stub.refuseRegistration(true);
    try {
      // 前の起動（画面が要求したもの。claude は `/bin/true` なので提出が無く `failed`）が畳まれるのを待つ
      await expect.poll(async () => (await readStatus()).invocation, { timeout: 10_000 }).not.toBe('running');
      const retriesBefore = readRetries();
      const registeredBefore = (await stub.stats()).registrations.length;

      // 巡回の起こし直しが走っている瞬間は busy（409）で断られるので、503 が返るまで要求する
      await expect
        .poll(async () => (await request.get(`${target}/invoke-agent`, { params: { cwd } })).status(), { timeout: 10_000 })
        .toBe(503);

      // 「起動の材料を組み立てられない」は起こし直しの回数を進めて `failed`（上限に達していれば
      // `error`）を書く（`ai.ts` の `recordBuildFailure`）。U13 の 503 は記録の書き込みより先に返るので、
      // 待って見る。巡回が同じ間に起動し直すこともあるので、回数は「増えた」ことだけを見る
      // 上限に達した記録（`error`）は回数を進めないので、回数の増加か `error` への到達のどちらかを待つ
      await expect
        .poll(async () => readRetries() > retriesBefore || (await readStatus()).invocation === 'error', { timeout: 10_000 })
        .toBe(true);
      expect(['failed', 'error']).toContain((await readStatus()).invocation);
      expect((await stub.stats()).registrations).toHaveLength(registeredBefore);
    } finally {
      await stub.refuseRegistration(false);
    }

    // 受け付けるようになれば、起動のたびに依頼し直す（続きの起動でも）。断られた実行の
    // 後始末（busy ガードの解放）が済むまで 409 が返りうるので、200 になるまで要求する。
    // 上限に達して `error` になっていれば `reset` で回数を戻して起こす（ユーザーの再実行と同じ口）
    const registeredWhileRefused = (await stub.stats()).registrations.length;
    await expect
      .poll(async () => (await request.get(`${target}/invoke-agent`, { params: { cwd, reset: '1' } })).status(), { timeout: 10_000 })
      .toBe(200);
    await expect
      .poll(async () => (await stub.stats()).registrations.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(registeredWhileRefused + 1);
    expect((await stub.stats()).registrations.at(-1)).toEqual({ projectPath: cwd });
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
   * `.spec-workflow/` ができただけでは完了にならない（specs/project/generation・
   * specs/project/directory。change `add-activated-phase`）。
   *
   * そのディレクトリは生成（P2）の依頼を本家が受理したときにでき、AI が起動する前、成果物が
   * 1つも無いうちからできている。実行が正常終了して A8 で `idle` が書かれても、完成の記録
   * （U15）が無い限り行は生成中のままで、成功の決着も届かない。
   */
  test('.spec-workflow/ ができて実行が終わっても、完成の記録が無ければ生成中のまま', async ({ page, request }) => {
    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();

    mkdirSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME, '.spec-workflow', 'steering'), { recursive: true });

    const finished = await request.post(`/api/strokes/${SEEDED_PROJECT_NAME}/submission`, {
      data: { invocation: 'idle' },
    });
    expect(finished.ok()).toBe(true);

    // U15 は叩かれていない（invokeAi は E2E では走らない）。成功の決着は届かず、行は生成中のまま
    await page.waitForTimeout(1_500);
    await expect(page.getByTestId('project-creation-notice')).toHaveCount(0);
    const row = page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME });
    await expect(row).toHaveAttribute('data-creation', 'in-progress');

    // 開き直しても生成中。走査に出るようになっても行の判定は phase で決まる
    await page.goto('/projects');
    await expect(page.getByTestId('project-row').filter({ hasText: SEEDED_PROJECT_NAME })).toHaveAttribute(
      'data-creation',
      'in-progress',
    );
  });

  /**
   * 完了が届くと、生成中の表現が外れて一度だけ祝う（specs/project/generation）。
   *
   * 完了の実体は完成の記録——呼び手が完成と判定したことを U15 が phase に書くこと——である
   * （specs/api/session/activate）。**U15 は判定を持たない**（ADR-0014）ので、成果物を置く
   * 必要は無い。invokeAi は E2E では走らないため、その呼び手の代わりに U15 を直接叩く。
   */
  test('完了が届くと通常の行に変わり、知らせてから選ばせる', async ({ page, request }) => {
    await page.goto('/projects');
    await expect(page.getByTestId('projects-table')).toBeVisible();

    const response = await request.post(`/api/sessions/${SEEDED_PROJECT_NAME}/activate`);
    expect(response.status()).toBe(204);

    // 完成は一度だけ。記録し直しは受理しない
    const again = await request.post(`/api/sessions/${SEEDED_PROJECT_NAME}/activate`);
    expect(again.status()).toBe(409);

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

    // 完成した（`activated`）本物のプロジェクトは、この口では消えない。根拠は phase で
    // あって `.spec-workflow/` の有無ではない（specs/api/project/delete）
    const refused = await request.delete(path);
    expect(refused.status()).toBe(409);
    expect(existsSync(join(PROJECTS_PARENT, SEEDED_PROJECT_NAME))).toBe(true);
  });
});
