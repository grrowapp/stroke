import type { Browser, Page } from '@playwright/test';

import { ALPHA, expect, resetBoard, test } from './support';

/**
 * markdown を描く画面で、**ハイドレーションがずれていない**ことを見る。
 *
 * `../modules/markdown/runtime/render/MarkdownView.vue` は `<MDC>` の**スロットだけ**を
 * 差し替えている。`<MDC>` の `useAsyncData` + `parseMarkdown` を写して置き換えると、
 * クライアントが解析をもう一度走らせて shiki が SSR と違う色を出し、Vue がハイドレーションを
 * 諦めて描き直す。実測ではその描き直しが**アプリ全体のアイコンの消失**として現れた。
 *
 * **この壊れ方は本文に症状が出ない。** 描き直された本文は（客側の解析結果として）正しく
 * 見えるので、本文の中身を確かめる検査（`upstream-style.spec.ts`）は素通りする。見つかったのは
 * 全画面のピクセル差分だった。だからここは本文の中身ではなく、**サーバが送った HTML と
 * ハイドレーション後の DOM が同じか**を見る。ずれた瞬間に落ちる。
 *
 * 形の側は単体が落とす。主は
 * `test/modules/markdown/runtime/render/markdown-view-position.test.ts`（`<MDC>` が実際に
 * 描かれたか）、従は `test/modules/markdown/runtime/position/silent-failure.test.ts`
 * （`parseMarkdown` を直に呼んでいないか・`<MDC>` を通しているかの文字列検査）。
 * こちらは形を保ったまま別の理由でずれた場合にも気づくための、症状の側の網である。
 *
 * **この網が拾えない食い違いが1つある。** Vue は本番ビルドでは要素の属性のずれを直さない
 * （実測。配る HTML の `style` だけを書き換えても、ハイドレーション後の DOM はサーバの値の
 * まま残った）。つまり**色だけが違う**場合はここを素通りする。拾えるのは字と要素の並びの
 * ずれ——Vue が描き直す側のずれで、実測の症状（アイコンの消失）はそちらの結果である。
 *
 * **別の手段を探したが、いまの構えでは拾えない**（`openspec/changes/
 * adr0017-sub-add-detection-assumptions/design.md` の決定5）。
 *
 * - **DOM を突き合わせても出てこない。** 属性のずれは「客側が描こうとした値」と DOM の
 *   食い違いであって、DOM もサーバの HTML もサーバの値のまま一致する。ここで何を比べても
 *   現れない
 * - **Vue は本番ビルドで属性の照合そのものを回していない。** `propHasMismatch` の呼び出しは
 *   `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` で囲われており（実測:
 *   `node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js:2202`）、本番では
 *   警告も `console.error('Hydration completed but contains mismatches.')` も出ない。
 *   **拾うにはこのフラグを立てたビルドが要る**——配るものを変える話なので、検知のためだけに
 *   入れない
 *
 * **主の検知はこれで足りている。** 実測した症状（アイコンの消失）は字と要素の並びのずれから
 * 来ており、そちらは下の検査が拾う。色だけのずれを拾う仕掛けを新設すると、この網が
 * 「ハイドレーションの検査基盤」へ育つ。
 *
 * **`@nuxt/icon` の 404 は直さない**（proposal の対象外）。この環境ではカスタムコレクションが
 * 読めず、SSR も客側も空の `<svg>` を出すため**アイコン消失そのものが再現しない**。だが
 * 消失は症状であって原因ではない。原因は「SSR と客側で字と要素の並びがずれる」ことで、
 * 下の検査はその原因側を見ているので、404 が直っていなくても検知は成り立つ。
 * （`icons` の本数を見る行は、アイコンが**在る**環境で描き直しの症状を捉えるためのもので、
 * 空の `<svg>` しか出ない環境でも「減っていないこと」は同じように見られる。）
 */

const DOCUMENT = `/projects/${ALPHA}/steering/product`;

/** SSR で送られてくる HTML のうち、アイコンとして数える形（`UIcon` が出す `svg`） */
const ICON = 'svg[role="img"]';

/**
 * 本文のうち、SSR と客側で**一致しなければならない**箇所。
 *
 * 図（mermaid）は客側で SVG に描き変わるのが正しい振る舞いなので外す。残りは
 * サーバが描いたものがそのまま引き継がれる。
 *
 * - `code` …… shiki の色付け。**ここが食い違うとハイドレーションが崩れる**（実測の原因）
 * - `prose` …… 見出し・段落・表。位置の包み（`data-src-*`）もここに乗る
 * - `icons` …… 本文の外を含むアイコンの数。描き直しの症状が出る場所
 */
interface Shape {
  code: string;
  prose: string[];
  icons: number;
}

async function shapeOf(page: Page): Promise<Shape> {
  const body = await page.getByTestId('document-content').evaluate((root) => ({
    // `ProsePre` は `data-testid` を入れ物の `div` にも付けるので、`pre` に絞る
    code: root.querySelector('pre[data-testid="code-block-body"]')?.innerHTML ?? '(コードブロックが無い)',
    prose: Array.from(root.querySelectorAll('h1, h2, p, li, th, td')).map((node) => node.outerHTML),
  }));

  return { ...body, icons: await page.locator(ICON).count() };
}

/**
 * サーバが送った HTML そのものを DOM にして読む。
 *
 * **その画面が受け取った HTML でなければならない。** 同じ URL をもう一度取り直すと、
 * ハイドレーションのずれを別の応答と比べることになり、描き直しで辻褄が合った結果を
 * 「一致した」と読んでしまう。だから配った本文を控えておいて、それを読む。
 *
 * javaScript を切った文脈で読むので、スクリプトは動かない（＝ハイドレーションの前の姿）。
 */
async function shapeOfServerHtml(browser: Browser, html: string): Promise<Shape> {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return await shapeOf(page);
  } finally {
    await context.close();
  }
}

test.describe('markdown を描く画面のハイドレーション', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('サーバが送った本文が、ハイドレーションの後もそのまま残っている', async ({ browser, page }) => {
    let served = '';

    // 配られた HTML を控える。**書き換えない**。素通しして、後で同じものと突き合わせる
    await page.route(DOCUMENT, async (route) => {
      const response = await route.fetch();
      served = await response.text();
      await route.fulfill({ response, body: served });
    });

    await page.goto(DOCUMENT);
    await expect(page.getByTestId('document-content')).toBeVisible();
    // Vue がマウントを終えている＝ハイドレーションまで進んでいる
    await page.waitForFunction(() =>
      Boolean((document.getElementById('__nuxt') as unknown as { __vue_app__?: unknown })?.__vue_app__),
    );
    await page.waitForLoadState('networkidle');

    expect(served, 'SSR の HTML を掴めていない').not.toBe('');
    const before = await shapeOfServerHtml(browser, served);
    const after = await shapeOf(page);

    // 前提。どれかが空だと、この検査は何も見ていない
    expect(before.code, 'SSR の時点でコードブロックが描かれていない').toContain('shiki');
    expect(before.prose.length, 'SSR の時点で本文の要素が無い').toBeGreaterThan(0);
    expect(before.icons, 'SSR の時点でアイコンが1つも無い').toBeGreaterThan(0);

    // **色が食い違うとここが落ちる。** 解析を客側でやり直したときに最初に壊れる場所
    expect(after.code, 'コードブロックの色付けが SSR と客側で違う（解析が二度走っている）').toBe(before.code);
    expect(after.prose, '本文の要素が SSR と客側で違う').toEqual(before.prose);
    // 描き直しの症状は本文の外に出る。**アイコンが減っていたらそれ**
    expect(after.icons, 'ハイドレーションの後でアイコンが減っている').toBe(before.icons);
  });
});
