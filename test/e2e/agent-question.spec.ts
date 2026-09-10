import type { APIRequestContext, Page } from '@playwright/test';

import { expect, settleRun, test } from './support';

/**
 * 問いの往復（openspec/specs/agent-question）。
 *
 * 問いを出して答えを受ける機構は1本（`AgentQuestion`）で、置き場所が違うだけの画面が
 * 2つある。素置きのストローク画面（画面1）と、proposal 確認画面の上にオーバーレイで
 * 開く問い返し（画面2）である。ここで確かめるのは spec の Requirement 全件、すなわち
 * 「オーバーレイで開く」「並びが画面で変わらない」「排他」「答えるまで閉じない」
 * 「待機は面の中」「書きかけを持ち越さない」「送り直せる」。
 *
 * 段取りはエージェント側の口（A5 の問い提出・A7 の proposal 提出）と、その実行の決着
 * （A9）を直接叩いて作る。画面のためのテスト専用の抜け道はアプリに足していない。
 *
 * AI の起動（`invoke-agent`）だけはブラウザ側で差し替える。実物は `claude` を子プロセス
 * として起こすもので、テストが確かめたいのは起動の先ではなく「送ったあと面がどう動くか」
 * だからである。差し替えるのは経路の末端1本だけで、受理（U7）もセッションの状態も本物。
 */

/** 話題タグ12字・問い本文20字・選択肢の説明50字までが契約（server/utils/stroke/question.ts） */
const QUESTION = {
  header: '保存の方式',
  detail: 'ここまでに決まったこと: 記録はファイルに置く。調べて分かったこと: 既存の実装は書き終わるまで待っている。',
  question: '保存方式をどうするか',
  options: [
    { label: '同期で書く', description: '書き終わるまで待つ。取りこぼしが起きない', recommended: true },
    { label: '非同期で書く', description: '待たずに返す。速いが取りこぼしが起きうる' },
  ],
};

const NEXT_QUESTION = {
  header: '置き場',
  detail: '保存方式は同期に決まった。次に記録の置き場を決める。',
  question: '置き場をどうするか',
  options: [
    { label: 'セッション配下', description: 'セッションを消すと一緒に消える' },
    { label: '別ディレクトリ', description: 'セッションを消しても残る' },
  ],
};

/**
 * 契約の上限いっぱいの問い（`server/utils/stroke/question.ts`）。
 * 詳細説明300字・選択肢5件。これが面に収まらない側の代表になる。
 */
const LONG_QUESTION = {
  header: '長い問いの例',
  detail: 'ここまでに確定していること、および調べて分かった事実をすべて書き出しておく。'.repeat(10).slice(0, 300),
  question: 'どの方針で進めるか',
  options: [
    { label: '案A', description: '今の実装を保ったまま、足りない所だけを足す' },
    { label: '案B', description: '置き換える。作り直す手間はかかるが筋は通る' },
    { label: '案C', description: '両方を並べて動かし、様子を見てから決める' },
    { label: '案D', description: '今回は決めず、材料が揃うまで先送りにする' },
    { label: '案E', description: 'そもそもの前提を疑い、要否から問い直す' },
  ],
};

/** 面の中に並ぶものを、上から順に並べた形。画面が違っても同じでなければならない */
const EXPECTED_LAYOUT = [
  'agent-question-scroll',
  'agent-question-count',
  'agent-question-header',
  'agent-question-detail',
  'agent-question-text',
  'agent-question-option',
  'agent-question-recommended',
  'agent-question-option',
  'agent-question-free',
  'agent-question-submit',
];

/** 後片付けのために、このファイルが作ったセッションを覚えておく */
let created: string[] = [];

async function startSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/sessions', {
    data: { overview: 'E2E: 問いの往復を確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };
  created.push(sessionId);
  return sessionId;
}

/**
 * A5 で今の1問を提出し、その実行を決着させる（A9）。**2段で1つの段取りである。**
 *
 * 受理した瞬間には配信されない。W1 が流れるのは実行の決着の時点だけになったので
 * （change fix-rename-during-running-session）、開いている面へ次の問いを届けるには
 * 決着まで進める必要がある。
 */
async function submitQuestion(
  request: APIRequestContext,
  sessionId: string,
  question: unknown = QUESTION,
): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/question`, { data: question });
  expect(response.ok(), await response.text()).toBeTruthy();
  await settleRun(request, sessionId, 'question');
}

/**
 * A7 で proposal を提出し、その実行を決着させる（A9）。決着で phase が `proposed` になり、
 * 今の1問は落ちる。提出だけでは phase は動かないので、画面2 の段取りにならない。
 */
async function submitProposal(request: APIRequestContext, sessionId: string): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
    data: { proposal: '# 提案\n\nE2E の proposal 本文。', projectName: 'e2e-agent-question' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await settleRun(request, sessionId, 'proposal');
}

/**
 * AI の起動だけを差し替える。受理（U7）は本物のまま通す。
 * 全てのテストで先に張るので、実物の `claude` はこのファイルからは一度も起きない。
 */
async function stubInvokeAgent(page: Page): Promise<void> {
  await page.route('**/invoke-agent', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );
}

/** 面の中の並びを、DOM の順で読み出す */
function layoutOf(page: Page): Promise<string[]> {
  return page
    .getByTestId('agent-question')
    .evaluate((root) =>
      Array.from(root.querySelectorAll('[data-testid]')).map(
        (el) => el.getAttribute('data-testid') ?? '',
      ),
    );
}

test.describe('問いの往復', () => {
  test.beforeEach(async ({ page }) => {
    created = [];
    await stubInvokeAgent(page);
  });

  test.afterEach(async ({ request }) => {
    for (const sessionId of created) {
      await request.delete(`/api/sessions/${sessionId}`).catch(() => undefined);
    }
    created = [];
  });

  // --- Requirement: 問いの見え方は画面によって変わらない

  test('画面1 と画面2 で、面の並びも構成も同じ', async ({ page, request }) => {
    // 画面1（素置き）
    const stroking = await startSession(request);
    await submitQuestion(request, stroking);
    await page.goto(`/strokes/${stroking}`);

    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);
    const onStroke = await layoutOf(page);

    // 画面2（proposal 確認の上にオーバーレイで開く問い返し）
    const proposed = await startSession(request);
    await submitProposal(request, proposed);
    await submitQuestion(request, proposed);
    await page.goto(`/strokes/${proposed}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();

    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);
    const onProposal = await layoutOf(page);

    // 話題タグ → 詳細説明 → 問い本文 → 選択肢とその説明 → 自由入力欄。推奨には印が付く
    expect(onStroke).toEqual(EXPECTED_LAYOUT);
    expect(onProposal).toEqual(EXPECTED_LAYOUT);
    expect(onProposal).toEqual(onStroke);
  });

  // --- Requirement: 問いは置かれた画面の上にオーバーレイで開く

  test('問い返しは画面を離れずに重なって開き、背後は操作を受け付けない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitProposal(request, sessionId);
    await submitQuestion(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();

    // 背後は `getByRole` では引けない。面が開いている間、reka-ui が背後（`#__nuxt`）へ
    // `aria-hidden="true"` を付けて accessibility tree から外すためで（trace で実測）、
    // これは「背後を操作させない」が効いている印そのものである。DOM そのものは
    // 一切変わらない（同じ trace で、`#__nuxt` の子が前のスナップショットへの参照の
    // ままであることを確認済み）ので、ここでは DOM から引く。
    const approve = page.locator('button').filter({ hasText: '承認して作る' });

    // 別の画面へ移らない。背後の本文と操作はそのまま残っている
    expect(page.url()).toContain(`/strokes/${sessionId}/proposal`);
    await expect(approve).toBeVisible();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('agent-question')).toBeVisible();

    // 残ってはいるが、操作は届かない（面が覆い、背後の pointer-events が切られている）
    let blocked = false;
    try {
      await approve.click({ timeout: 2000 });
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);

    // 押せていない証拠として、承認の面は開いていない
    await expect(page.getByRole('dialog', { name: '承認してプロジェクトを作る' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // --- Requirement: 面は回答するまで閉じない

  test('答えずに閉じようとしても閉じない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitProposal(request, sessionId);
    await submitQuestion(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 閉じるボタンそのものが無い
    await expect(page.locator('[data-slot="close"]')).toHaveCount(0);

    // ESC でも閉じない
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();

    // 背景を押しても閉じない
    // 画面2 そのものがモーダルなので、オーバーレイは2枚重なる。**最前面（問いの面）**を押す
    await page.locator('[data-slot="overlay"]').last().click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);
  });

  test('AI が問いを打ち止めると面は閉じ、元の画面に戻る', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitProposal(request, sessionId);
    await submitQuestion(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();

    await page.getByTestId('agent-question-free').fill('自分の言葉で答える');
    await page.getByTestId('agent-question-submit').click();

    // 次の問いが来ないまま待機が明けたら、この面は用済みになって閉じる。
    // **画面2 そのものがモーダル**なので `dialog` は残る。閉じたことは問いの中身で見る
    await expect(page.getByTestId('agent-question')).toHaveCount(0, { timeout: 15_000 });
    expect(page.url()).toContain(`/strokes/${sessionId}/proposal`);
  });

  test('問いが置き換わると、画面2 を開き直しても書きかけは残っていない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitProposal(request, sessionId);
    await submitQuestion(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();

    await page.getByTestId('agent-question-free').fill('前の問いへの書きかけ');
    await page.getByTestId('agent-question-submit').click();
    // 画面2 そのものがモーダルなので `dialog` は残る。問いの面が閉じたことは中身で見る
    await expect(page.getByTestId('agent-question')).toHaveCount(0, { timeout: 15_000 });

    // 次の問いが届いたら、また同じ面で受ける
    await submitQuestion(request, sessionId, NEXT_QUESTION);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();

    await expect(page.getByTestId('agent-question-text')).toHaveText(NEXT_QUESTION.question);
    await expect(page.getByTestId('agent-question-free')).toHaveValue('');
    await expect(page.getByTestId('agent-question-option').first()).toHaveAttribute(
      'data-picked',
      'false',
    );
  });

  // --- 面の収まり（tasks 6.7）。送信ボタンは面の中に閉じているので、
  //     問いが長いときに押せなくならないことをここで固定する

  test('問いが長くても、画面2 の送信ボタンは面の中に残って押せる', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitProposal(request, sessionId);
    await submitQuestion(request, sessionId, LONG_QUESTION);

    await page.goto(`/strokes/${sessionId}/proposal`);
    await page.getByRole('button', { name: /AI から質問があります/ }).click();
    await expect(page.getByTestId('agent-question-text')).toHaveText(LONG_QUESTION.question);

    // 問いの中身は面に収まらない。スクロールするのはその中身だけ
    const scrolls = await page
      .getByTestId('agent-question-scroll')
      .evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);

    // 自由入力まで書く。ここで中身はスクロールする
    await page.getByTestId('agent-question-free').fill('長い問いにも答えられる');

    // 中身がスクロールしても、送信ボタンは面（ダイアログ）の中に残っている
    const submit = page.getByTestId('agent-question-submit');
    await expect(submit).toBeInViewport();
    const insideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
      const button = document
        .querySelector('[data-testid="agent-question-submit"]')
        ?.getBoundingClientRect();
      if (!dialog || !button) return false;
      return button.top >= dialog.top && button.bottom <= dialog.bottom + 1;
    });
    expect(insideDialog).toBe(true);

    // 実際に押せる
    await submit.click({ timeout: 2000 });
    await expect(page.getByTestId('agent-question-waiting')).toBeVisible();
  });

  test('画面1 は素置きなので、問いが長くても面の中にスクロールを作らない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId, LONG_QUESTION);
    await page.goto(`/strokes/${sessionId}`);
    await expect(page.getByTestId('agent-question-text')).toHaveText(LONG_QUESTION.question);

    // 高さの制約が無いので中身は伸びるだけ。ページごとスクロールする現行の見え方が変わらない
    const inner = await page
      .getByTestId('agent-question-scroll')
      .evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(inner.scroll).toBe(inner.client);
  });

  // --- Requirement: 回答は選択肢か自由入力のどちらか一方

  test('選択肢と自由入力は同時に立たない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);

    const options = page.getByTestId('agent-question-option');
    await expect(options).toHaveCount(2);

    // 選択肢を選ぶ
    await options.first().click();
    await expect(options.first()).toHaveAttribute('data-picked', 'true');

    // 自分の言葉で書くと、選択は外れる
    await page.getByTestId('agent-question-free').fill('どれでもない');
    await expect(options.first()).toHaveAttribute('data-picked', 'false');

    // 選び直すと、書いたものは消える
    await options.nth(1).click();
    await expect(options.nth(1)).toHaveAttribute('data-picked', 'true');
    await expect(page.getByTestId('agent-question-free')).toHaveValue('');
  });

  test('どちらも無いまま送ろうとすると、送らずに回答が要ると示す', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);
    await expect(page.getByTestId('agent-question-submit')).toBeVisible();

    let sent = 0;
    await page.route('**/api/sessions/*/answer', (route) => {
      sent += 1;
      return route.continue();
    });

    await page.getByTestId('agent-question-submit').click();

    await expect(page.getByTestId('agent-question-notice')).toBeVisible();
    expect(sent).toBe(0);

    // 問いは示されたまま残る
    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);
  });

  test('自分の言葉で書いて送ると、選択肢を選んだ扱いにならない', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);

    const bodies: string[] = [];
    await page.route('**/api/sessions/*/answer', async (route) => {
      bodies.push(route.request().postData() ?? '');
      return route.continue();
    });

    await page.getByTestId('agent-question-free').fill('どれでもない案がある');
    await page.getByTestId('agent-question-submit').click();

    await expect(page.getByTestId('agent-question-waiting')).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0] ?? '{}')).toEqual({ kind: 'free', value: 'どれでもない案がある' });
  });

  // --- Requirement: 次を待つ間の待機は面の中で示す
  // --- Requirement: 書きかけは次の問いへ持ち越さない

  test('送った直後は面の中で待ち、次の問いが同じ面に現れる', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);

    await page.getByTestId('agent-question-free').fill('前の問いへの書きかけ');
    await page.getByTestId('agent-question-submit').click();

    // 待機は面の中。回答欄も送信も無いので、続けて送ることはできない
    await expect(page.getByTestId('agent-question-waiting')).toBeVisible();
    await expect(page.getByTestId('agent-question-submit')).toHaveCount(0);
    await expect(page.getByTestId('agent-question-free')).toHaveCount(0);

    // 次の問いが返ると、待機は終わって同じ面に次が出る
    await submitQuestion(request, sessionId, NEXT_QUESTION);
    await expect(page.getByTestId('agent-question-text')).toHaveText(NEXT_QUESTION.question);
    await expect(page.getByTestId('agent-question-waiting')).toHaveCount(0);

    // 前の問いへの書きかけは持ち越さない
    await expect(page.getByTestId('agent-question-free')).toHaveValue('');
    await expect(page.getByTestId('agent-question-option').first()).toHaveAttribute(
      'data-picked',
      'false',
    );
  });

  // --- Requirement: 送れなかった回答は同じ問いのまま送り直せる

  test('回答が送れなかったら、同じ問いのまま送り直せる', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);

    // 1度目は受理そのものを落とす
    await page.route('**/api/sessions/*/answer', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await page.getByTestId('agent-question-option').first().click();
    await page.getByTestId('agent-question-submit').click();

    await expect(page.getByText('送信に失敗しました。もう一度送ってください。')).toBeVisible();
    // 問いは失われていない
    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);

    // 2度目は通す
    await page.unroute('**/api/sessions/*/answer');
    await page.getByTestId('agent-question-option').first().click();
    await page.getByTestId('agent-question-submit').click();

    await expect(page.getByTestId('agent-question-waiting')).toBeVisible();
  });

  test('AI から応答が得られなかったら、面は残って同じ問いに送り直せる', async ({ page, request }) => {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await page.goto(`/strokes/${sessionId}`);

    await page.getByTestId('agent-question-free').fill('答えは送れた');
    await page.getByTestId('agent-question-submit').click();
    await expect(page.getByTestId('agent-question-waiting')).toBeVisible();

    // 待機中のポーリング（U2）が failed を拾う局面を作る。
    // 実物で failed になるのは `claude` が応答を返さなかったときで、ここでは起こせない
    await page.route(new RegExp(`/api/sessions/${sessionId}$`), (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ phase: 'stroking', invocation: 'failed' }),
      }),
    );

    await expect(
      page.getByText('AI からの応答が得られませんでした。もう一度送信してください。'),
    ).toBeVisible({ timeout: 15_000 });

    // 面は残り、同じ問いにもう一度答えられる
    await expect(page.getByTestId('agent-question-text')).toHaveText(QUESTION.question);
    await expect(page.getByTestId('agent-question-submit')).toBeVisible();
  });
});

/**
 * 完全な失敗の後の導線（`docs/specs/architecture/failure.md`）。
 *
 * `error` はリトライ上限に達した終端で、システムは自動では何もしない。画面が示すのは
 * 性質の異なる3つ——そのまま再実行する / 時間を置いて再開する / 最初からやり直す——で、
 * 壊すのは最後の1つだけであり、そこには承諾が挟まる。**承諾の前には何も消えない。**
 *
 * `error` は実物では claude が上限まで応答しなかったときにだけ起きるので、E2E では
 * 待機中のポーリング（U2）の応答を差し替えて作る。
 */
test.describe('完全な失敗の後', () => {
  test.beforeEach(async ({ page }) => {
    created = [];
    await stubInvokeAgent(page);
  });

  test.afterEach(async ({ request }) => {
    for (const sessionId of created) {
      await request.delete(`/api/sessions/${sessionId}`).catch(() => undefined);
    }
    created = [];
  });

  /**
   * 実行の記録を `error` にする（A8）。**画面からは書けない**ので、invokeAi と同じ口を
   * テストから叩いて作る。実物で `error` になるのはリトライ上限に達したときだけで、
   * その状態そのものは A8 が書いた値と区別が付かない。
   */
  async function markError(request: APIRequestContext, sessionId: string): Promise<void> {
    const response = await request.post(`/api/strokes/${sessionId}/submission`, {
      data: { invocation: 'error' },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }

  async function reachError(page: Page, request: APIRequestContext): Promise<string> {
    const sessionId = await startSession(request);
    await submitQuestion(request, sessionId);
    await markError(request, sessionId);

    await page.goto(`/strokes/${sessionId}`);
    await expect(page.getByTestId('invocation-error')).toBeVisible({ timeout: 15_000 });
    return sessionId;
  }

  test('待機表示をやめ、性質の違う選択肢が3つ出る', async ({ page, request }) => {
    await reachError(page, request);

    // 待機のまま置き続けない。問いの面も畳む
    await expect(page.getByTestId('agent-question-waiting')).toBeHidden();
    await expect(page.getByTestId('agent-question')).toBeHidden();

    await expect(page.getByTestId('invocation-retry')).toBeVisible();
    await expect(page.getByTestId('invocation-leave')).toBeVisible();
    // 壊す1つは頭の位置に、警告色で分けて出る
    await expect(page.getByTestId('invocation-restart')).toBeVisible();
  });

  test('一覧へ戻っても対象は残り、開き直すと同じ選択肢が出る', async ({ page, request }) => {
    const sessionId = await reachError(page, request);

    await page.getByTestId('invocation-leave').click();
    await expect(page).toHaveURL(/\/projects$/);

    // **戻り道が一覧に在る。** 無ければ「時間を置いて再開する」は成り立たない
    const row = page.getByTestId('stroke-row').filter({ hasText: sessionId });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-invocation', 'error');

    // 消えていない。開き直せば同じ状態から選べる
    await row.getByTestId('stroke-resume').click();
    await expect(page).toHaveURL(new RegExp(`/strokes/${sessionId}$`));
    await expect(page.getByTestId('invocation-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('invocation-restart')).toBeVisible();
  });

  test('最初に戻るは承諾を経る。承諾しなければ何も消えない', async ({ page, request }) => {
    const sessionId = await reachError(page, request);

    await page.getByTestId('invocation-restart').click();
    // 何が消えるかを示す
    await expect(page.getByTestId('invocation-restart-warning')).toBeVisible();

    await page.getByTestId('invocation-restart-cancel').click();
    await expect(page.getByTestId('invocation-restart-warning')).toBeHidden();

    // セッションは残っている（U2 が 404 にならない）
    const status = await request.get(`/api/strokes/${sessionId}`);
    expect(status.ok(), await status.text()).toBeTruthy();
  });

  test('承諾すると削除され、概要の入力へ戻る', async ({ page, request }) => {
    const sessionId = await reachError(page, request);

    await page.getByTestId('invocation-restart').click();
    await page.getByTestId('invocation-restart-confirm').click();

    await expect(page).toHaveURL(/\/strokes$/);
    await expect(page.getByText('作りたいシステムを書く')).toBeVisible();

    const status = await request.get(`/api/strokes/${sessionId}`);
    expect(status.status()).toBe(404);
  });
});
