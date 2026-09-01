import { expect, test, type Page } from '@playwright/test';

import { ALPHA, addSelectionComment, painted, resetBoard, selectIn, stub } from './support';

/**
 * 承認画面の2つの面（プレビュー / 生テキスト）と、そこで付けた指摘の行き先。
 *
 * 指摘はどちらの面でも付けられ、どちらで付けても両方の面に出る（specs/project/ui）。
 * 溜めた指摘は差し戻し（`needs-revision`）で本家へ渡り、`response` / `annotations` /
 * `comments` の3つのフィールドとして承認リクエストと同じファイルに書かれる。1本のテキストに
 * 畳まないので、箇所と指摘の対応が残る。
 *
 * 承認・却下は指摘を運ばない。それらは承認一覧の側にあり、`workspace.spec.ts` が見る。
 */

const APPROVAL = `/projects/${ALPHA}/approvals/an1`;

/** 承認対象の本文。スタブは保存されていない文書に `# <件名>\n\n本文` を返す */
const TITLE = 'ステアリング: product.md の承認';

/**
 * 生テキストの面で、本文全体での文字オフセットを指して選ぶ。
 *
 * 生テキストの面は書いてある通りの字なので、面の上の文字数と生テキストのオフセットが一致する。
 */
const selectRange = (page: Page, start: number, end: number): Promise<void> =>
  selectIn(page, 'approval-annotate-source', { start, end });

/** 差し戻して、本家へ届いた箇所つきの指摘を返す */
async function revise(page: Page) {
  await page.getByTestId('approval-revision').click();
  await expect(page).toHaveURL(new RegExp(`/projects/${ALPHA}/approvals$`));

  const { lastApprovalAction } = await stub.stats();
  const comments = lastApprovalAction?.comments as
    | { type: string; comment: string; selectedText?: string; startOffset?: number; endOffset?: number }[]
    | null;
  return (comments ?? []).filter((item) => item.type === 'selection');
}

test.describe('承認画面の2つの面', () => {
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

  test('プレビュー / 生テキスト の2つで、両方を並べる面は無い', async ({ page }) => {
    await page.goto(APPROVAL);

    await expect(page.getByTestId('approval-mode-preview')).toHaveText('プレビュー');
    await expect(page.getByTestId('approval-mode-annotate')).toHaveText('生テキスト');
    await expect(page.getByTestId('approval-modes').getByRole('button')).toHaveCount(2);
    await expect(page.getByTestId('approval-mode-side-by-side')).toHaveCount(0);
  });

  test('開いたときはプレビューで、そのまま指摘を付けられる', async ({ page }) => {
    await page.goto(APPROVAL);

    // 整形された本文が出ており、生テキストの面は出ていない
    await expect(page.getByTestId('document-content')).toBeVisible();
    await expect(page.getByTestId('approval-annotate-source')).toHaveCount(0);

    // 指摘を付ける口はこの面でも出る。切り替えを促す断り書きは無い
    await expect(page.getByTestId('approval-add-general')).toBeVisible();
    await expect(page.getByTestId('approval-comments')).not.toContainText('切り替える');
  });

  test('生テキストに切り替えると生の markdown が出る', async ({ page }) => {
    await page.goto(APPROVAL);
    await page.getByTestId('approval-mode-annotate').click();

    // 整形せずそのまま出るので、見出しの `#` が文字として見える
    await expect(page.getByTestId('approval-annotate-source')).toContainText(`# ${TITLE}`);
    await expect(page.getByTestId('approval-add-general')).toBeVisible();
  });
});

/**
 * 右の指摘の一覧（コメント欄）はしまえる（specs/project/ui「承認画面の指摘の一覧はしまえる」）。
 *
 * しまうと 44px のつまみだけが残り、空いた幅は本文が取る。開閉の口は4つ
 * （掴んで引く / 見出し帯のボタン / しまった帯のクリック / 右辺の不可視のレール）。
 * 左のナビとは連動せず、コメント欄の幅は左の状態で変わらない。しまった状態は保存しない。
 */
test.describe('コメント欄をしまう', () => {
  const TUCKED = '44px';

  const widthOf = (page: Page, testId: string): Promise<number> =>
    page.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().width);

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
    await expect(page.getByTestId('approval-comments')).toHaveAttribute('data-tucked', 'false');
  });

  test('見出し帯のボタンでしまうと 44px のつまみだけが残り、本文がその分だけ広がる', async ({
    page,
  }) => {
    const comments = page.getByTestId('approval-comments');
    const before = await widthOf(page, 'approval-main');
    const open = await widthOf(page, 'approval-comments');

    await page.getByTestId('approval-comments-tuck').click();

    await expect(comments).toHaveAttribute('data-tucked', 'true');
    await expect(comments).toHaveCSS('width', TUCKED);
    await expect(page.getByTestId('approval-comments-handle')).toBeVisible();

    // 一覧の中身（見出し・差し戻し）は畳まれている
    await expect(page.getByTestId('approval-revision')).toHaveCount(0);

    // 空いた幅は本文が取る
    const after = await widthOf(page, 'approval-main');
    expect(Math.round(after - before)).toBe(Math.round(open - 44));
  });

  test('つまみを押すと一覧だけが元の幅で戻り、左のナビは動かない', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');
    const sidebar = page.getByTestId('workspace-sidebar');
    const open = await widthOf(page, 'approval-comments');

    await page.getByTestId('approval-comments-tuck').click();
    await expect(comments).toHaveCSS('width', TUCKED);
    // 一覧をしまっても左は動かない
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await expect(sidebar).toHaveCSS('width', '256px');

    await page.getByTestId('approval-comments-handle').click();

    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);
    await expect(page.getByTestId('approval-revision')).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-collapsed', 'false');
  });

  test('右辺のレールは押せるが、見た目を持たず hover でも光らない', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');
    const rail = page.getByTestId('approval-comments-toggle');

    const look = () =>
      rail.evaluate((element) => {
        const own = getComputedStyle(element);
        return {
          background: own.backgroundColor,
          borderWidth: own.borderTopWidth,
          children: element.childElementCount,
          width: Math.round(element.getBoundingClientRect().width),
          height: Math.round(element.getBoundingClientRect().height),
          asideHeight: Math.round(element.parentElement!.getBoundingClientRect().height),
        };
      });

    const idle = await look();
    expect(idle.background).toBe('rgba(0, 0, 0, 0)');
    expect(idle.borderWidth).toBe('0px');
    expect(idle.children).toBe(0);
    // 右辺に沿った 20px 幅の全高
    expect(idle.width).toBe(20);
    // `inset-y-0` は枠（1px）の内側に張り付く
    expect(Math.abs(idle.height - idle.asideHeight)).toBeLessThanOrEqual(2);

    await rail.hover();
    expect((await look()).background).toBe('rgba(0, 0, 0, 0)');

    await rail.click();
    await expect(comments).toHaveCSS('width', TUCKED);
    expect((await look()).background).toBe('rgba(0, 0, 0, 0)');

    await rail.click();
    await expect(comments).toHaveAttribute('data-tucked', 'false');
  });

  test('掴んで右へ引き、半分より狭い位置で放すとしまう', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');
    const box = (await comments.boundingBox())!;

    // ボタンや入力の上ではない所（空の一覧の文言）から掴む
    const grip = (await page.getByTestId('approval-comments-empty').boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + box.width * 0.7, y, { steps: 10 });

    // 幅が指に追従している
    const dragging = await widthOf(page, 'approval-comments');
    expect(dragging).toBeLessThan(box.width / 2);
    expect(dragging).toBeGreaterThanOrEqual(44);

    await page.mouse.up();

    await expect(comments).toHaveAttribute('data-tucked', 'true');
    await expect(comments).toHaveCSS('width', TUCKED);
  });

  test('掴んで少しだけ引いて放しても開いたまま。動かさずに放しても何も起きない', async ({
    page,
  }) => {
    const comments = page.getByTestId('approval-comments');
    const open = await widthOf(page, 'approval-comments');

    const grip = (await page.getByTestId('approval-comments-empty').boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;

    // 半分より広い位置で放す → 開いたまま、幅も元どおり
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 5 });
    await page.mouse.up();

    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);

    // 動かさずに放す（ただのクリック）→ 何も起きない
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();

    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);
  });

  test('しまった帯を掴んで左へ引くと開く', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');
    const open = await widthOf(page, 'approval-comments');

    await page.getByTestId('approval-comments-tuck').click();
    await expect(comments).toHaveCSS('width', TUCKED);

    const handle = (await page.getByTestId('approval-comments-handle').boundingBox())!;
    const x = handle.x + handle.width / 2;
    const y = handle.y + 100;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - open, y, { steps: 10 });
    await page.mouse.up();

    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);
    // 放した直後の click でもう一度切り替わらない
    await page.waitForTimeout(400);
    await expect(comments).toHaveAttribute('data-tucked', 'false');
  });

  test('左のナビを畳んでも一覧は出たままで幅も変わらず、空いた幅は本文だけが取る', async ({
    page,
  }) => {
    const comments = page.getByTestId('approval-comments');
    const sidebar = page.getByTestId('workspace-sidebar');

    const open = await widthOf(page, 'approval-comments');
    const mainBefore = await widthOf(page, 'approval-main');

    await page.getByTestId('sidebar-collapse').click();
    await expect(sidebar).toHaveCSS('width', '64px');

    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);

    // 本文は左が空けた 192px（256 − 64）だけ広がる
    const mainAfter = await widthOf(page, 'approval-main');
    expect(Math.round(mainAfter - mainBefore)).toBe(256 - 64);

    // 左を開き直しても一覧の幅は変わらない
    await page.getByTestId('sidebar-collapse').click();
    await expect(sidebar).toHaveCSS('width', '256px');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);
  });

  test('左を畳んだ状態で開いても、一覧は左が開いているときと同じ幅になる', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');
    const open = await widthOf(page, 'approval-comments');

    await page.getByTestId('sidebar-collapse').click();
    await expect(page.getByTestId('workspace-sidebar')).toHaveCSS('width', '64px');

    await page.reload();
    await expect(page.getByTestId('workspace-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await expect(comments).toHaveCSS('width', `${Math.round(open)}px`);
  });

  test('本文に固定幅は無く、ビューポートに追従する', async ({ page }) => {
    const wide = await widthOf(page, 'approval-main');

    await page.setViewportSize({ width: 1600, height: 720 });
    const wider = await widthOf(page, 'approval-main');
    expect(wider).toBeGreaterThan(wide);

    await page.setViewportSize({ width: 1100, height: 720 });
    const narrower = await widthOf(page, 'approval-main');
    expect(narrower).toBeLessThan(wide);
  });

  test('しまった状態は保存されず、開き直すと一覧は出ている', async ({ page }) => {
    const comments = page.getByTestId('approval-comments');

    /** ブラウザに残るもの。しまう前後で増えないことを見る */
    const stored = async () => ({
      cookies: (await page.context().cookies()).map((cookie) => cookie.name).sort(),
      local: await page.evaluate(() => Object.keys(localStorage).sort()),
      session: await page.evaluate(() => Object.keys(sessionStorage).sort()),
    });
    const before = await stored();

    await page.getByTestId('approval-comments-tuck').click();
    await expect(comments).toHaveCSS('width', TUCKED);

    // URL に含めない
    await expect(page).toHaveURL(new RegExp(`${APPROVAL}$`));
    // cookie / localStorage / sessionStorage にも書かない
    expect(await stored()).toEqual(before);

    await page.reload();
    await expect(comments).toHaveAttribute('data-tucked', 'false');
    await expect(page.getByTestId('approval-comments-handle')).toHaveCount(0);
    await expect(page.getByTestId('approval-revision')).toBeVisible();
  });

  test('しまっている間も、ヘッダーの戻る導線とプロジェクト表示、面の切替は見える', async ({
    page,
  }) => {
    await page.getByTestId('approval-comments-tuck').click();
    await expect(page.getByTestId('approval-comments')).toHaveCSS('width', TUCKED);

    await expect(page.getByTestId('back-to-portal')).toBeVisible();
    await expect(page.getByTestId('workspace-project-name')).toBeVisible();
    await expect(page.getByTestId('approval-modes')).toBeVisible();

    // 面の切替はしまっている間も効く
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
    await expect(page.getByTestId('approval-comments')).toHaveCSS('width', TUCKED);
  });
});

/**
 * 生テキストの面で指摘を付ける。面の作りは変わった（生テキストは `MarkdownSource`、塗りは
 * CSS Custom Highlight API）が、**振る舞いは変わらない**——選んだ範囲・付いた注釈・本家へ
 * 渡る値は以前と同じでなければならない。
 */
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

    // 選んだ箇所は本文上でも目立つ。塗りは要素を作らない（`<mark>` は無い）
    await expect.poll(() => painted(page)).toContain('ステアリング');
    await expect(page.getByTestId('approval-annotate-source').locator('mark')).toHaveCount(0);
  });

  test('箇所に紐づかない指摘は全体へのコメントで付ける', async ({ page }) => {
    await page.getByTestId('approval-add-general').click();

    const modal = page.getByRole('dialog');
    await modal.getByRole('textbox').fill('全体の構成を見直してほしい');
    await modal.getByRole('button', { name: '付ける' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    await expect(page.getByTestId('approval-comment')).toContainText('全体へのコメント');

    // 箇所に紐づかないので本文は塗られない
    expect(await painted(page)).toEqual([]);
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
   * 生テキストの面で語を探して選び、差し戻して、本家へ届いた箇所つきの指摘を1件返す。
   *
   * **オフセットで指さない。** 指すと、こちらが数えた位置を面へ教えることになり、面が
   * 自分で数えた位置と食い違っても分からない。DOM に出ている字の上で選び、**面が何番と
   * 答えるか**を見る。
   */
  async function reviseWith(page: Page, word: string) {
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();

    await selectIn(page, 'approval-annotate-source', { word });
    await addSelectionComment(page, `${word} を直してほしい`);
    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');

    const [selection] = await revise(page);
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

/**
 * 整形された本文の面からの往復（散文・コードブロックの内側・図）。
 *
 * 整形された本文の上で選んだ範囲は、位置の口（`MarkdownView` の `toSourceRange`）が生テキストの
 * 位置に写す。**位置の持ち方は生テキストの1本だけ**なので、どちらの面で付けても同じ注釈が
 * 両方の面に出て、本家へ渡る値も同じ形になる（`openspec/specs/annotation`）。
 *
 * ここでも期待値を数値で書かない。送られたオフセットで本文を切って、選んだ字と突き合わせる。
 */
test.describe('整形された本文で指摘を付ける', () => {
  const RICH_CONTENT = [
    '# 整形された本文',
    '',
    '一つめの段落に**強調されたモモンガ**が居る。',
    '',
    '```ts',
    'const answer = compute(42);',
    'export { answer };',
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    '  a[はじめ] --> b[おわり]',
    '```',
    '',
    '最後の段落。',
    '',
  ].join('\n');

  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'an1',
      title: TITLE,
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
      content: RICH_CONTENT,
    });
    await page.goto(APPROVAL);
    await expect(page.getByTestId('document-content')).toBeVisible();
  });

  test('散文: プレビューで選んだ箇所に指摘が付き、生テキストの面にも同じ注釈が出る', async ({
    page,
  }) => {
    // 読んでいる面のまま付ける。面を切り替えない
    await selectIn(page, 'document-content', { word: 'モモンガ' });
    await addSelectionComment(page, '名前を変えてほしい');

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    const card = page.getByTestId('approval-comment');
    await expect(card).toContainText('モモンガ');
    await expect(card).toContainText('名前を変えてほしい');

    // 整形された本文の上で塗られている。要素は増えていない
    await expect.poll(() => painted(page)).toContain('モモンガ');
    await expect(page.getByTestId('document-content').locator('mark')).toHaveCount(0);

    // 一覧 → 本文。「本文へ」で、その範囲がしばらく目立つ
    await card.getByTestId('comment-locate').click();
    await expect.poll(() => painted(page, 'focus')).toContain('モモンガ');

    // 本文 → 一覧。塗られた字を押すと、そのコメントの編集が開く
    const point = await page.getByTestId('document-content').evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const at = (node as Text).data.indexOf('モモンガ');
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 4);
        const box = range.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      throw new Error('本文に「モモンガ」が出ていない');
    });
    await page.mouse.click(point.x, point.y);
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('textbox')).toHaveValue('名前を変えてほしい');
    await modal.getByRole('button', { name: 'やめる' }).click();
    await expect(modal).toHaveCount(0);

    // 生テキストの面へ切り替えても、一覧はそのままで、同じ注釈が対応する箇所に出る
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    await expect(card).toContainText('名前を変えてほしい');
    await expect.poll(() => painted(page)).toContain('モモンガ');

    // 本家へ渡る位置は生テキストの上の同じ語を指す
    const [selection] = await revise(page);
    expect(selection?.selectedText).toBe('モモンガ');
    expect(RICH_CONTENT.slice(selection?.startOffset, selection?.endOffset)).toBe('モモンガ');
  });

  test('散文: 強調をまたいで選ぶと、生テキストの上で連続した1つの範囲になる', async ({
    page,
  }) => {
    await selectIn(page, 'document-content', { word: 'モモンガが居る' });
    await addSelectionComment(page, '要素をまたいだ指摘');

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    // 強調の表示は崩れない（要素構造に触れていない）
    await expect(page.getByTestId('document-content').locator('strong')).toHaveText(
      '強調されたモモンガ',
    );

    // 生テキストの上では強調の記号（`**`）を跨いだ1つの範囲
    const [selection] = await revise(page);
    expect(selection?.selectedText).toBe('モモンガ**が居る');
    expect(RICH_CONTENT.slice(selection?.startOffset, selection?.endOffset)).toBe('モモンガ**が居る');
  });

  test('コードブロックの内側: 行の一部を選ぶと、その範囲だけに付く', async ({ page }) => {
    await selectIn(page, 'document-content', { word: 'compute(42)' });
    await addSelectionComment(page, '関数名を変えてほしい');

    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');
    await expect(page.getByTestId('approval-comment')).toContainText('compute(42)');
    await expect.poll(() => painted(page)).toContain('compute(42)');

    // 生テキストの面でも同じ範囲を指す
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
    await expect.poll(() => painted(page)).toContain('compute(42)');

    const [selection] = await revise(page);
    expect(selection?.selectedText).toBe('compute(42)');
    expect(RICH_CONTENT.slice(selection?.startOffset, selection?.endOffset)).toBe('compute(42)');
  });

  test('図: 注釈が付いた図にだけ生テキストが添えられ、付けた一語だけが示される', async ({
    page,
  }) => {
    const body = page.getByTestId('document-content');

    // 図は描かれている。注釈が無いうちは生テキストを添えない
    await expect(body.getByTestId('mermaid-diagram').locator('svg')).toBeVisible({ timeout: 15_000 });
    await expect(body.getByTestId('mermaid-source')).toHaveCount(0);

    // 生テキストの面で、図の中の一語に付ける
    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
    await selectIn(page, 'approval-annotate-source', { word: 'おわり' });
    await addSelectionComment(page, '終端の名前を変えてほしい');
    await expect(page.getByTestId('approval-comment-count')).toHaveText('1');

    // プレビューへ戻ると、図は残ったまま、そのもとになった生テキストが添えられる
    await page.getByTestId('approval-mode-preview').click();
    await expect(body.getByTestId('mermaid-with-source')).toBeVisible({ timeout: 15_000 });
    await expect(body.getByTestId('mermaid-diagram').locator('svg')).toBeVisible();
    await expect(body.getByTestId('mermaid-source')).toContainText('flowchart LR');
    // 添えられた生テキストの上で、付けた一語だけが塗られる
    await expect.poll(() => painted(page)).toEqual(['おわり']);

    // 添えられた生テキストの上でも選べる。図全体には広がらない
    await selectIn(page, 'mermaid-source', { word: 'はじめ' });
    await addSelectionComment(page, '始端の名前を変えてほしい');
    await expect(page.getByTestId('approval-comment-count')).toHaveText('2');
    await expect.poll(() => painted(page)).toEqual(['おわり', 'はじめ']);

    // 差し戻しで送られる位置は、付けたときの範囲のまま
    const selections = await revise(page);
    expect(selections.map((item) => item.selectedText)).toEqual(['おわり', 'はじめ']);
    for (const item of selections) {
      expect(RICH_CONTENT.slice(item.startOffset, item.endOffset)).toBe(item.selectedText);
    }
  });

  test('一方の面で消した注釈は、もう一方の面からも消える', async ({ page }) => {
    await selectIn(page, 'document-content', { word: 'モモンガ' });
    await addSelectionComment(page, '消される指摘');
    await expect.poll(() => painted(page)).toContain('モモンガ');

    await page.getByTestId('approval-mode-annotate').click();
    await expect(page.getByTestId('approval-annotate-source')).toBeVisible();
    await expect.poll(() => painted(page)).toContain('モモンガ');

    await page.getByTestId('approval-comment').getByRole('button', { name: '消す' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '消す' }).click();

    await expect(page.getByTestId('approval-comment-count')).toHaveText('0');
    await expect.poll(() => painted(page)).toEqual([]);

    await page.getByTestId('approval-mode-preview').click();
    await expect(page.getByTestId('approval-comment-count')).toHaveText('0');
    await expect.poll(() => painted(page)).toEqual([]);
  });
});
