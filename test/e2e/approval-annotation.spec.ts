import { expect, test, type Page } from '@playwright/test';

import { ALPHA, resetBoard, stub } from './support';

/**
 * 承認画面の3つの面（プレビュー / 注釈 / 並列表示）と、そこで付けた指摘の行き先。
 *
 * 指摘を付けられるのは生テキストが出ている面だけである。溜めた指摘は差し戻し
 * （`needs-revision`）で本家へ渡り、`response` / `annotations` / `comments` の3つの
 * フィールドとして承認リクエストと同じファイルに書かれる。1本のテキストに畳まないので、
 * 箇所と指摘の対応が残る。
 *
 * 承認・却下は指摘を運ばない。それらは承認一覧の側にあり、`workspace.spec.ts` が見る。
 */

const APPROVAL = `/projects/${ALPHA}/approvals/an1`;

/** 承認対象の本文。スタブは保存されていない文書に `# <件名>\n\n本文` を返す */
const TITLE = 'ステアリング: product.md の承認';

/**
 * 生テキストの上で範囲を選び、注釈の面に選択が起きたことを伝える。
 *
 * 注釈はレンダリング後の HTML ではなく生テキストに対して付くので、位置は本文全体での
 * 文字オフセットで指す。断片は `data-start` を持っており、面はそこから位置を復元する。
 */
async function selectRange(page: Page, start: number, end: number): Promise<void> {
  await page.evaluate(
    (range) => {
      const surface = document.querySelector('[data-testid="approval-annotate-source"]');
      if (surface === null) throw new Error('注釈の面が出ていない');

      const parts = [...surface.querySelectorAll<HTMLElement>('[data-start]')];
      const holder = parts.find((element) => {
        const from = Number(element.dataset.start);
        return from <= range.start && range.end <= from + (element.textContent ?? '').length;
      });
      if (holder === undefined) throw new Error('選ぶ範囲が1つの断片に収まっていない');

      const text = holder.firstChild;
      if (text === null) throw new Error('断片に文字が無い');

      const from = Number(holder.dataset.start);
      const selection = document.createRange();
      selection.setStart(text, range.start - from);
      selection.setEnd(text, range.end - from);

      const current = window.getSelection();
      if (current === null) throw new Error('選択を作れない');
      current.removeAllRanges();
      current.addRange(selection);

      surface.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { start, end },
  );
}

/** 本文へのコメントを1件付ける。モーダルが開いてから本文を入れて確定する */
async function addSelectionComment(page: Page, body: string): Promise<void> {
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await modal.getByRole('textbox').fill(body);
  await modal.getByRole('button', { name: '付ける' }).click();
  await expect(modal).toHaveCount(0);
}

test.describe('承認画面の3つの面', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'an1',
      title: TITLE,
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
  });

  test('プレビュー / 注釈 / 並列表示 の3つがある', async ({ page }) => {
    await page.goto(APPROVAL);

    await expect(page.getByTestId('approval-mode-preview')).toHaveText('プレビュー');
    await expect(page.getByTestId('approval-mode-annotate')).toHaveText('注釈');
    await expect(page.getByTestId('approval-mode-side-by-side')).toHaveText('並列表示');
  });

  test('開いたときはプレビューで、指摘は付けられない', async ({ page }) => {
    await page.goto(APPROVAL);

    // 整形された本文が出ており、生テキストの面は出ていない
    await expect(page.getByTestId('document-content')).toBeVisible();
    await expect(page.getByTestId('approval-annotate-source')).toHaveCount(0);

    // 指摘を付ける口も出ない。代わりに切り替えを促す
    await expect(page.getByTestId('approval-add-general')).toHaveCount(0);
    await expect(page.getByTestId('approval-comments')).toContainText('切り替える');
  });

  test('注釈に切り替えると生の markdown が出る', async ({ page }) => {
    await page.goto(APPROVAL);
    await page.getByTestId('approval-mode-annotate').click();

    // 整形せずそのまま出るので、見出しの `#` が文字として見える
    await expect(page.getByTestId('approval-annotate-source')).toContainText(`# ${TITLE}`);
    await expect(page.getByTestId('approval-add-general')).toBeVisible();
  });

  test('並列表示は左が生テキスト、右が整形', async ({ page }) => {
    await page.goto(APPROVAL);
    await page.getByTestId('approval-mode-side-by-side').click();

    await expect(page.getByTestId('approval-annotate-source')).toContainText(`# ${TITLE}`);
    // 右は整形なので `#` は消え、見出しの要素になる
    await expect(page.getByTestId('approval-rendered').locator('h1')).toHaveText(TITLE);
  });

  test('面を切り替えても編集の直しかけは消えない', async ({ page }) => {
    await page.goto(APPROVAL);

    await page.getByTestId('document-edit').click();
    await page.getByTestId('document-input').fill('# 直しかけ');

    await page.getByTestId('approval-mode-annotate').click();
    await page.getByTestId('approval-mode-preview').click();

    await expect(page.getByTestId('document-input')).toHaveValue('# 直しかけ');
  });
});

test.describe('指摘を付ける', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'an1',
      title: TITLE,
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(APPROVAL);
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
  });

  test('本文を選ぶとその箇所にコメントが付く', async ({ page }) => {
    // `# ステアリング: …` の 2〜8 文字目。見出し記号の後ろの6文字
    await selectRange(page, 2, 8);
    await addSelectionComment(page, '言い回しを直してほしい');

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');

    const card = page.getByTestId('approval-comment');
    await expect(card).toContainText('本文へのコメント');
    // 引用は選んだ箇所そのもの
    await expect(card).toContainText('ステアリング');
    await expect(card).toContainText('言い回しを直してほしい');

    // 選んだ箇所は本文上でも目立つ
    await expect(page.getByTestId('approval-annotate-source').locator('mark')).toHaveText(
      'ステアリング',
    );
  });

  test('箇所に紐づかない指摘は全体へのコメントで付ける', async ({ page }) => {
    await page.getByTestId('approval-add-general').click();

    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox').fill('全体の構成を見直してほしい');
    await modal.getByRole('button', { name: '付ける' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    await expect(page.getByTestId('approval-comment')).toContainText('全体へのコメント');

    // 箇所に紐づかないので本文は塗られない
    await expect(page.getByTestId('approval-annotate-source').locator('mark')).toHaveCount(0);
  });

  test('付けたコメントは消せる', async ({ page }) => {
    await page.getByTestId('approval-add-general').click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox').fill('消される指摘');
    await modal.getByRole('button', { name: '付ける' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');

    await page.getByTestId('approval-comment').getByRole('button', { name: '消す' }).click();
    // 確認のモーダルの側の「消す」。カードの側と同じ文言なのでモーダルに絞る
    await page.getByRole('dialog').getByRole('button', { name: '消す' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('0');
    await expect(page.getByTestId('approval-comments-empty')).toBeVisible();
  });
});

/**
 * 差し戻しは本家の `POST /approvals/:id/needs-revision` を呼ぶ。承認・却下とは別経路で、
 * 指摘を運ぶのはこれだけである。
 */
test.describe('差し戻す', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'an1',
      title: TITLE,
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(APPROVAL);
  });

  test('コメントが1件も無いと差し戻せない', async ({ page }) => {
    await page.getByTestId('approval-revision').click();

    await expect(page.getByTestId('approval-revision-failure')).toBeVisible();

    // 本家には何も届いていない
    const { lastApprovalAction } = await stub.stats();
    expect(lastApprovalAction).toBeNull();
  });

  test('指摘が3つのフィールドに分かれて本家へ届く', async ({ page }) => {
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();

    await selectRange(page, 2, 8);
    await addSelectionComment(page, '言い回しを直してほしい');

    await page.getByTestId('approval-add-general').click();
    const general = page.getByRole('dialog');
    await general.getByRole('textbox').fill('全体の構成を見直してほしい');
    await general.getByRole('button', { name: '付ける' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('2');

    await page.getByTestId('approval-revision').click();

    // 本家が保留中から外すので、一覧へ戻ると空になっている
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));
    await expect(page.getByTestId('approvals-empty')).toBeVisible();

    const { lastApprovalAction } = await stub.stats();
    expect(lastApprovalAction?.action).toBe('needs-revision');
    expect(lastApprovalAction?.id).toBe('an1');

    // response — 人が読める要約
    expect(lastApprovalAction?.response).toContain('コメント 2 件');
    expect(lastApprovalAction?.response).toContain('全体の構成を見直してほしい');
    expect(lastApprovalAction?.response).toContain('言い回しを直してほしい');

    // comments — 箇所と指摘の対応を保った構造化配列
    const comments = lastApprovalAction?.comments as
      | { type: string; comment: string; selectedText?: string; startOffset?: number; endOffset?: number }[]
      | null;
    expect(comments).toHaveLength(2);
    expect(comments?.[0]).toMatchObject({
      type: 'selection',
      comment: '言い回しを直してほしい',
      selectedText: 'ステアリング',
      startOffset: 2,
      endOffset: 8,
    });
    expect(comments?.[1]).toMatchObject({
      type: 'general',
      comment: '全体の構成を見直してほしい',
    });

    // annotations — 上の2つをまとめた記録。本家はこれも同じファイルに書く
    const record = JSON.parse(lastApprovalAction?.annotations ?? '{}') as {
      decision: string;
      comments: unknown[];
    };
    expect(record.decision).toBe('needs-revision');
    expect(record.comments).toHaveLength(2);
  });
});

/**
 * 外へ出るオフセットの基準。
 *
 * **本家へ渡すオフセットは、本家が持っている文書へそのまま当たらなければならない**
 * （`openspec/specs/project/ui`）。整形して読むために内側で行う作り変え（CRLF を潰す・
 * 前置きを落とす）の後の座標を送ってはならない。
 *
 * ここが崩れても画面には何も出ない。**本家のダッシュボードが別の場所を塗るだけ**である。
 * だから値そのものを、本家が持っている本文へ当てて確かめる。
 *
 * **期待値を数値で書かない。** 送られたオフセットで本家の本文を切り、選んだ語と一致するかを
 * 見る。本文を書き換えても壊れない。
 */
test.describe('本家へ渡るオフセットの基準', () => {
  /** 改行の表現が CRLF の文書。マーカーは CRLF を4つ跨いだ先に置く */
  const CRLF_CONTENT = [
    '# 改行の表現が CRLF の文書',
    '',
    '一つめの段落。',
    '',
    '二つめの段落にモモンガが居る。',
    '',
  ].join('\r\n');

  /** 先頭に前置きを持つ文書。前置きは本文より長い */
  const FRONT_MATTER_CONTENT = [
    '---',
    'title: 前置きを持つ文書',
    'status: draft',
    'reviewers: [alpha, beta]',
    '---',
    '',
    '# 本文の見出し',
    '',
    '本文にモモンガが居る。',
    '',
  ].join('\n');

  /**
   * 生テキストの面で語を探して選ぶ。
   *
   * **オフセットで指さない。** 指すと、こちらが数えた位置を面へ教えることになり、面が
   * 自分で数えた位置と食い違っても分からない。DOM に出ている字の上で選び、**面が何番と
   * 答えるか**を見る。
   */
  async function selectWord(page: Page, word: string): Promise<void> {
    await page.evaluate((target) => {
      const surface = document.querySelector('[data-testid="approval-annotate-source"]');
      if (surface === null) throw new Error('注釈の面が出ていない');

      for (const element of surface.querySelectorAll<HTMLElement>('[data-start]')) {
        const text = element.firstChild;
        if (text === null || text.nodeType !== Node.TEXT_NODE) continue;

        const at = (text.textContent ?? '').indexOf(target);
        if (at === -1) continue;

        const selection = document.createRange();
        selection.setStart(text, at);
        selection.setEnd(text, at + target.length);

        const current = window.getSelection();
        if (current === null) throw new Error('選択を作れない');
        current.removeAllRanges();
        current.addRange(selection);

        surface.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }

      throw new Error(`面に「${target}」が出ていない`);
    }, word);
  }

  /** 差し戻して、本家へ届いた箇所つきの指摘を1件返す */
  async function reviseWith(page: Page, word: string) {
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();

    await selectWord(page, word);
    await addSelectionComment(page, `${word} を直してほしい`);
    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');

    await page.getByTestId('approval-revision').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));

    const { lastApprovalAction } = await stub.stats();
    const comments = lastApprovalAction?.comments as
      | { type: string; selectedText?: string; startOffset?: number; endOffset?: number }[]
      | null;

    const selection = comments?.find((item) => item.type === 'selection');
    expect(selection, '箇所つきの指摘が届いていない').toBeDefined();
    return selection!;
  }

  async function openWith(page: Page, content: string): Promise<void> {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'an1',
      title: TITLE,
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
      content,
    });
    await page.goto(APPROVAL);
  }

  test('CRLF を含む文書で、オフセットが本家の本文へそのまま当たる', async ({ page }) => {
    await openWith(page, CRLF_CONTENT);

    const selection = await reviseWith(page, 'モモンガ');

    expect(selection.selectedText).toBe('モモンガ');
    // 本家が持っているのは CRLF のままの文書。そこへ当てて同じ語を指すこと
    expect(CRLF_CONTENT.slice(selection.startOffset, selection.endOffset)).toBe('モモンガ');
  });

  test('前置きを持つ文書で、オフセットが本家の本文へそのまま当たる', async ({ page }) => {
    await openWith(page, FRONT_MATTER_CONTENT);

    const selection = await reviseWith(page, 'モモンガ');

    expect(selection.selectedText).toBe('モモンガ');
    // 前置きを落とした後の座標を送ると、ここが前置きの中の字を指して落ちる
    expect(FRONT_MATTER_CONTENT.slice(selection.startOffset, selection.endOffset)).toBe('モモンガ');
  });

  /**
   * **承認の対象は文書ぜんたいである。** 位置合わせの都合で前置きを見えなくしてよい部分では
   * ない（`openspec/specs/project/ui`「指摘を付けるために、対象文書の一部を隠してはならない」）。
   */
  test('前置きの中にも指摘を付けられる', async ({ page }) => {
    await openWith(page, FRONT_MATTER_CONTENT);
    await page.getByTestId('approval-mode-annotate').click();

    // 面から取り除かれていないこと
    await expect(page.getByTestId('approval-annotate-source')).toContainText('title: 前置きを持つ文書');

    const selection = await reviseWith(page, '前置きを持つ文書');

    expect(selection.selectedText).toBe('前置きを持つ文書');
    expect(FRONT_MATTER_CONTENT.slice(selection.startOffset, selection.endOffset)).toBe(
      '前置きを持つ文書',
    );
  });
});
