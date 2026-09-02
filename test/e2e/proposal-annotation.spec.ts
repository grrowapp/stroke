import { expect, test, type APIRequestContext } from '@playwright/test';

import { addSelectionComment, painted, selectIn } from './support';

/**
 * ストローク側の proposal 確認画面の面（プレビュー / 生テキスト）と、そこで付けた指摘。
 *
 * 承認画面（`approval-annotation.spec.ts`）と同じ実体（`useAnnotations` / `AnnotateSource`）を
 * 共有しており、面も同じく2つである（specs/stroke/frontier「proposal の見せ方は2つで、
 * どちらでも指摘を付けられる」）。片方だけが3つのままになっていないことを、こちらでも見る。
 *
 * 承認して作る流れは `stroke-exit.spec.ts`、受理した proposal が残ることは
 * `proposal-persistence.spec.ts` が見る。ここは面と指摘だけ。
 */

const PROPOSAL_BODY = [
  '# 提案',
  '',
  '一つめの段落に**強調されたモモンガ**が居る。',
  '',
  '最後の段落。',
  '',
].join('\n');

async function startSession(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/strokes', {
    data: { overview: 'E2E: proposal 確認画面の面と指摘を確かめる' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { sessionId } = (await response.json()) as { sessionId: string };
  return sessionId;
}

async function submitProposal(request: APIRequestContext, sessionId: string): Promise<void> {
  const response = await request.post(`/api/strokes/${sessionId}/proposal`, {
    data: { proposal: PROPOSAL_BODY, projectName: 'e2e-proposal-annotation' },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe('proposal 確認画面の2つの面', () => {
  let created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const name of created) {
      await request.delete(`/api/sessions/${name}`).catch(() => undefined);
    }
    created = [];
  });

  test('プレビュー / 生テキスト の2つで、左右に並べる面は無い', async ({ page, request }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);
    await submitProposal(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    // proposal は WS で届き、整形はブラウザ側で走る。字が出てから触る
    await expect(page.getByTestId('proposal-preview')).toContainText('モモンガ');

    await expect(page.getByRole('button', { name: 'プレビュー' })).toBeVisible();
    await expect(page.getByRole('button', { name: '生テキスト' })).toBeVisible();
    await expect(page.getByRole('button', { name: '左右' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '並列表示' })).toHaveCount(0);
  });

  test('プレビューで付けた指摘が生テキストの面にも出て、消せば両方から消える', async ({
    page,
    request,
  }) => {
    const sessionId = await startSession(request);
    created.push(sessionId);
    await submitProposal(request, sessionId);

    await page.goto(`/strokes/${sessionId}/proposal`);
    // proposal は WS で届き、整形はブラウザ側で走る。字が出てから触る
    await expect(page.getByTestId('proposal-preview')).toContainText('モモンガ');

    // 読んでいる面のまま付ける
    await selectIn(page, 'proposal-preview', { word: 'モモンガ' });
    await addSelectionComment(page, '名前を変えてほしい');

    await expect(page.getByText('コメント(1)')).toBeVisible();
    await expect(page.getByRole('button', { name: '差し戻す(1)' })).toBeVisible();
    await expect.poll(() => painted(page)).toEqual(['モモンガ']);

    // 生テキストの面へ切り替えても、一覧はそのままで、同じ注釈が対応する箇所に出る
    await page.getByRole('button', { name: '生テキスト' }).click();
    await expect(page.getByTestId('proposal-source')).toBeVisible();
    await expect(page.getByTestId('proposal-source')).toContainText('**強調されたモモンガ**');
    await expect(page.getByText('コメント(1)')).toBeVisible();
    await expect.poll(() => painted(page)).toEqual(['モモンガ']);

    // 生テキストの面で消すと、プレビューからも消える
    // 画面の器も dialog なので、確認のモーダルは題で引く
    await page.getByRole('button', { name: '消す' }).first().click();
    await page.getByRole('dialog', { name: 'このコメントを消す' }).getByRole('button', { name: '消す' }).click();
    await expect(page.getByText('コメント(0)')).toBeVisible();
    await expect.poll(() => painted(page)).toEqual([]);

    await page.getByRole('button', { name: 'プレビュー' }).click();
    await expect(page.getByTestId('proposal-preview')).toBeVisible();
    await expect(page.getByText('コメント(0)')).toBeVisible();
    await expect.poll(() => painted(page)).toEqual([]);
  });
});
