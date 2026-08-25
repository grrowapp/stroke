import { expect, test } from '@playwright/test';

import { ALPHA, resetBoard, stub } from './support';

/**
 * 文書の編集と保存（specs/document-editing）。
 *
 * 扱うのは markdown のテキストそのもので、読み込みと保存のあいだに変換を挟まない。
 * そのため「開いて保存しただけで内容が変わる」ことが構造的に起きない。ここではその
 * 前提が保たれているか、直しかけを取りこぼさないかを確かめる。
 */

const SPEC_DOC = `/projects/${ALPHA}/specs/auth-spec/requirements`;
const STEERING_DOC = `/projects/${ALPHA}/steering/product`;

test.describe('仕様書の文書を直す', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('編集に入ると本文が markdown のまま出る', async ({ page }) => {
    await page.goto(SPEC_DOC);

    // 読みのときは markdown として描かれている
    await expect(page.getByTestId('document-input')).toHaveCount(0);

    await page.getByTestId('document-edit').click();

    // 編集に入ると生のテキストになる。描画を挟まないので中身がそのまま出る
    await expect(page.getByTestId('document-input')).toHaveValue(/# auth-spec 要件定義/);
  });

  test('直して保存すると、開き直しても残っている', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    await page.getByTestId('document-input').fill('# 直した要件\n\n新しい本文');
    await page.getByTestId('document-save').click();

    await expect(page.getByTestId('document-saved')).toBeVisible();

    // 開き直す。本家に届いていなければ元の内容に戻る
    await page.goto(SPEC_DOC);
    await expect(page.getByText('直した要件')).toBeVisible();
  });

  test('保存の直後に別の文書へ移ると、前の文書の「保存しました」は残らない', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    await page.getByTestId('document-input').fill('# 直した要件\n\n新しい本文');
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-saved')).toBeVisible();

    // チップが自動で消える3秒を待たずに移る。
    // 消す責務を timer だけに預けると、ここでチップが残る
    await page.goto(STEERING_DOC);

    await expect(page.getByTestId('document-saved')).toHaveCount(0);
  });

  test('保存する前は未保存であることが分かる', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    await expect(page.getByTestId('document-unsaved')).toHaveCount(0);

    await page.getByTestId('document-input').fill('直しかけ');
    await expect(page.getByTestId('document-unsaved')).toBeVisible();
  });

  test('直していなければ保存できない', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    await expect(page.getByTestId('document-save')).toBeDisabled();
  });

  test('やめると直しかけが捨てられる', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    await page.getByTestId('document-input').fill('捨てられる内容');
    await page.getByTestId('document-cancel').click();

    // 読みに戻り、保存されている内容が出る
    await expect(page.getByTestId('document-input')).toHaveCount(0);
    await expect(page.getByText('auth-spec 要件定義')).toBeVisible();
  });

  test('表を含む本文を保存しても表が壊れない', async ({ page }) => {
    // WYSIWYG を採らなかった理由がこれ（markdown-roundtrip.test.ts）。
    // 変換を挟まない構成なので、書いたとおりに保存される
    const table = '# 表\n\n| 列1 | 列2 |\n| --- | --- |\n| a | b |';

    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();
    await page.getByTestId('document-input').fill(table);
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-saved')).toBeVisible();

    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    // 1文字も変わっていない
    await expect(page.getByTestId('document-input')).toHaveValue(table);
  });
});

test.describe('ステアリングの文書を直す', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('直して保存すると、開き直しても残っている', async ({ page }) => {
    await page.goto(STEERING_DOC);
    await page.getByTestId('document-edit').click();

    await page.getByTestId('document-input').fill('# 直したプロダクト方針');
    await page.getByTestId('document-save').click();

    await expect(page.getByTestId('document-saved')).toBeVisible();

    await page.goto(STEERING_DOC);
    await expect(page.getByText('直したプロダクト方針')).toBeVisible();
  });
});

test.describe('未作成の文書', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('編集の口が出ない', async ({ page }) => {
    // スタブは design を未作成にしてある
    await page.goto(`/projects/${ALPHA}/specs/auth-spec/design`);

    await expect(page.getByTestId('document-missing')).toBeVisible();
    await expect(page.getByTestId('document-edit')).toHaveCount(0);
  });
});

test.describe('承認依頼から対象文書を直す', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'r1',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
  });

  test('レビューするを押すと、まず本文が整形して出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals`);
    await page.getByTestId('record-open').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals/r1$`));

    // 承認は読んで判断する場。いきなり生テキストの入力欄にしない
    await expect(page.getByTestId('document-content')).toBeVisible();
    await expect(page.getByTestId('document-input')).toHaveCount(0);

    // 直すときは編集へ入れる
    await expect(page.getByTestId('document-edit')).toBeVisible();
  });

  test('承認画面で直すと、その文書の画面にも反映される', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/approvals/r1`);

    await page.getByTestId('document-edit').click();
    await page.getByTestId('document-input').fill('# 承認画面から直した');
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-saved')).toBeVisible();

    // 同じ実体なので、ステアリングの画面から見ても変わっている
    await page.goto(`/projects/${ALPHA}/steering/product`);
    await expect(page.getByText('承認画面から直した')).toBeVisible();
  });

  test('編集できない文書を指す承認依頼は読むだけになる', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'r2',
      title: '知らない文書の承認',
      filePath: '.spec-workflow/specs/auth-spec/unknown.md',
      category: 'spec',
      categoryName: 'spec',
    });

    await page.goto(`/projects/${ALPHA}/approvals/r2`);

    await expect(page.getByTestId('document-input')).toHaveCount(0);
    await expect(page.getByTestId('document-edit')).toHaveCount(0);
  });
});

test.describe('直しかけのまま離れようとする', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('引き止められ、留まると内容が残る', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();
    await page.getByTestId('document-input').fill('残ってほしい内容');

    // 留まる方を選ぶ
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByTestId('sidebar-tasks').click();

    await expect(page).toHaveURL(new RegExp(`${SPEC_DOC}$`));
    await expect(page.getByTestId('document-input')).toHaveValue('残ってほしい内容');
  });

  test('引き止められたうえで離れると捨てられる', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();
    await page.getByTestId('document-input').fill('捨てられる内容');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('sidebar-tasks').click();

    await expect(page).toHaveURL(/\/tasks$/);

    // 戻っても保存されていない
    await page.goto(SPEC_DOC);
    await expect(page.getByText('auth-spec 要件定義')).toBeVisible();
  });

  test('直していなければ引き止められない', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.accept();
    });

    await page.getByTestId('sidebar-tasks').click();

    await expect(page).toHaveURL(/\/tasks$/);
    expect(asked).toBe(false);
  });

  test('直して元に戻したら引き止められない', async ({ page }) => {
    await page.goto(SPEC_DOC);
    await page.getByTestId('document-edit').click();

    const original = await page.getByTestId('document-input').inputValue();
    await page.getByTestId('document-input').fill('一度直す');
    await expect(page.getByTestId('document-unsaved')).toBeVisible();

    // 元に戻す。編集操作の有無ではなく内容の比較で判定している
    await page.getByTestId('document-input').fill(original);
    await expect(page.getByTestId('document-unsaved')).toHaveCount(0);

    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.accept();
    });

    await page.getByTestId('sidebar-tasks').click();

    await expect(page).toHaveURL(/\/tasks$/);
    expect(asked).toBe(false);
  });
});
