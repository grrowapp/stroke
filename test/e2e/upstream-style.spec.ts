import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { ALPHA, expect, resetBoard, stub, test } from './support';

/**
 * 下層とトーストが本家の様式になっているかを、稼働中の画面から読む。
 *
 * 上層は prototype が正で、それは `design-token.spec.ts` が押さえている。下層は prototype が
 * 「この問いの対象外」と書いているので、出どころは本家しかない（tasks.md 10章）。
 *
 * 期待値は本家の CSS バンドル（archive の prototype/assets/spec-workflow.css）から直接読む。
 * ここに数値を書き写すと、本家が変わったときにテストだけが古い値で通り続ける。
 */

/**
 * トーストのアイコンを絵で見分けるための本家のパス。
 *
 * `UIcon` はアイコン名を DOM に出さない（クラスは `iconify--upstream` までで、
 * コレクションは分かっても種別は分からない）。トーストは種別ごとに絵が変わることを
 * 見たいので、本家から写したパスそのもので絞る。
 * 値の出どころは `app/assets/icons.ts` の `upstream:` コレクション。
 */
const UPSTREAM_PATH = {
  checkCircle: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  infoCircle: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  close: 'M6 18L18 6M6 6l12 12',
} as const;

/**
 * openspec は worktree に無い。**メインの作業ツリーだけが実体を持ち**、全セッションが
 * そこを共有している（`docs/agents/issue-tracker.md`）。worktree から走らせても読めるよう、
 * 実体のある側を指す。
 */
const UPSTREAM_CSS = join(
  '/opt/projects/stroke-board/openspec',
  'changes/archive/2026-08-20-steering-dashboard-portal/prototype/assets/spec-workflow.css',
);

/** 本家の CSS から1つのセレクタの宣言を読む */
function upstreamRule(selector: string): Record<string, string> {
  const css = readFileSync(UPSTREAM_CSS, 'utf-8');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\{([^}]*)\\}`));

  if (match === null) throw new Error(`本家 CSS に ${selector} が無い`);

  return Object.fromEntries(
    match[1]!
      .split(';')
      .map((declaration) => {
        const at = declaration.indexOf(':');
        return at === -1 ? null : [declaration.slice(0, at).trim(), declaration.slice(at + 1).trim()];
      })
      .filter((pair): pair is [string, string] => pair !== null),
  );
}

/**
 * 本家の `:root` が持つトークンの値。
 *
 * 余白の 4px グリッド（`--space-*`）は stroke-board 側に持っていないので、画面から
 * 解決するのではなく本家の宣言から読む。
 */
function upstreamRootToken(name: string): string {
  const css = readFileSync(UPSTREAM_CSS, 'utf-8');
  const match = css.match(new RegExp(`${name}:\\s*([^;}]+)`));

  if (match === null) throw new Error(`本家 CSS に ${name} が無い`);

  return match[1]!.trim();
}

/** `var(--x)` を実際に解決された値に直して比べるため、画面側から読んだ値と突き合わせる */
async function resolvedTokens(
  page: import('@playwright/test').Page,
  names: string[],
): Promise<Record<string, string>> {
  return page.evaluate((list: string[]) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(list.map((name) => [name, style.getPropertyValue(name).trim()]));
  }, names);
}

test.describe('画面は縦いっぱいに組まれる', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  /**
   * prototype 案A の `.frame` は縦の flex で、`.body` が残りをすべて取る。本家のサイドバーも
   * `lg:h-screen`。どちらも「サイドバーが画面の下まで伸びている」形で、中身の高さで切れない。
   */
  test('下層のサイドバーは画面の下まで伸びる', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    const { sidebar, header, viewport } = await page.evaluate(() => ({
      sidebar: document.querySelector('[data-testid="workspace-sidebar"]')!.getBoundingClientRect()
        .height,
      header: document.querySelector('header')!.getBoundingClientRect().height,
      viewport: window.innerHeight,
    }));

    // ヘッダーを除いた残り全部
    expect(Math.round(sidebar)).toBe(Math.round(viewport - header));
  });

  test('上層の本文は画面の下まで伸びる', async ({ page }) => {
    await page.goto('/');

    const { main, viewport } = await page.evaluate(() => {
      const box = document.querySelector('main')!.getBoundingClientRect();
      return { main: box.height + box.top, viewport: window.innerHeight };
    });

    expect(Math.round(main)).toBe(Math.round(viewport));
  });
});

test.describe('下層の枠は本家の .card と同じ', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('パネルの面・枠・角丸が本家と同じ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    const tokens = await resolvedTokens(page, [
      '--surface-panel',
      '--border-default',
      '--radius-lg',
    ]);

    /*
     * 読むのは `.panel`。本家の `.card`（tailwind.css）は**どの `.tsx` も名乗っていない**
     * 定義だけの class で、実際に画面の箱を作っているのは `.panel`（53 箇所で使用）。
     */
    const rule = upstreamRule('.panel');
    expect(rule.background).toBe('var(--surface-panel)');
    expect(rule.border).toBe('1px solid var(--border-default)');
    expect(rule['border-radius']).toBe('var(--radius-lg)');

    const style = await page.locator('.sb-panel').first().evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        background: own.backgroundColor,
        borderWidth: own.borderTopWidth,
        borderRadius: own.borderTopLeftRadius,
      };
    });

    expect(style.background).toBe(hexToRgb(tokens['--surface-panel']!));
    expect(style.borderWidth).toBe('1px');
    expect(style.borderRadius).toBe(tokens['--radius-lg']);
  });
});

/**
 * 本家は操作の帯とデータの領域を地続きにしない。切り方は3つとも同じで、
 * **データの領域を `.panel` と同じ箱に入れて 1px の枠で切る**。
 *
 * - `SpecViewerPage` — 操作の panel と本文の panel を 2 枚並べ、間を 16px 空ける
 * - `ApprovalsAnnotator` — 本文の列を `bg-panel border rounded-lg` で囲う（面を切り替えても同じ）
 * - `ApprovalsPage` — 見出しのブロックと本文のブロックを `border-t` 1本で分ける
 */
test.describe('操作の帯とデータの領域が本家と同じに分かれる', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  /*
   * 文書の画面は本文の箱を**二重にしない**。
   *
   * 本家（`SpecViewerPage`）は本文を `.panel p-4` 1枚だけで囲み、その内側いっぱいに
   * contentEditable の暗い面（#111827）を敷く。稼働中の本家で実測すると
   * パネル x=280 w=1136（padding 16 / 枠 1px）→ 暗い面 x=297 w=1102（padding 12）→
   * 本文 x=309 w=1078。
   *
   * ここに `.sb-panel` をもう1枚挟んでいたときは、同じ 1440px で本文が w=1068 になり
   * 本家より 34px 狭かった。領域を示す役は暗い面が担うので、内側の箱は枠を持たない。
   */
  test('文書の本文は本家と同じく枠1枚の中の暗い面に載る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering/product`);

    const tokens = await resolvedTokens(page, [
      '--surface-panel',
      '--border-default',
      '--radius-lg',
    ]);

    const shape = await page.evaluate(() => {
      const panel = document.querySelector('main .sb-panel')!;
      const body = document.querySelector('[data-testid="document-body"]')!;
      const content = document.querySelector('[data-testid="document-content"]')!;
      const own = getComputedStyle(panel);
      const bodyStyle = getComputedStyle(body);
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { left: Math.round(rect.left), width: Math.round(rect.width) };
      };
      return {
        panel: {
          background: own.backgroundColor,
          borderWidth: own.borderTopWidth,
          borderColor: own.borderTopColor,
          radius: own.borderTopLeftRadius,
          padding: own.paddingTop,
          ...box(panel),
        },
        // 内側の入れ物は枠も面も持たない
        body: {
          borderWidth: bodyStyle.borderTopWidth,
          background: bodyStyle.backgroundColor,
          ...box(body),
        },
        content: box(content),
      };
    });

    // 外側は本家の `.panel` と同じ値
    expect(shape.panel.background).toBe(hexToRgb(tokens['--surface-panel']!));
    expect(shape.panel.borderWidth).toBe('1px');
    expect(shape.panel.borderColor).toBe(hexToRgb(tokens['--border-default']!));
    expect(shape.panel.radius).toBe(tokens['--radius-lg']);
    expect(shape.panel.padding).toBe('16px');

    // 内側に2枚目の枠を作らない
    expect(shape.body.borderWidth).toBe('0px');
    expect(shape.body.background).toBe('rgba(0, 0, 0, 0)');

    // 暗い面はパネルの内側いっぱい（左右に余分な余白を作らない）
    expect(shape.content.left).toBe(shape.panel.left + 1 + 16);
    expect(shape.content.width).toBe(shape.panel.width - 2 - 32);
  });

  test('操作の帯と本文の箱は本家と同じ 16px 空く', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering/product`);

    // 本家の `SpecViewerPage` は操作と本文を `grid gap-4`（16px）で離す
    const gap = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="document-edit"]')!.getBoundingClientRect();
      const body = document.querySelector('[data-testid="document-body"]')!.getBoundingClientRect();
      return Math.round(body.top - bar.bottom);
    });

    expect(gap).toBe(16);
  });

  test('承認画面はどの面でも本文が枠の中に入る', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'region1',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(`/projects/${ALPHA}/approvals/region1`);

    const tokens = await resolvedTokens(page, ['--surface-panel', '--border-default']);

    const expected = {
      background: hexToRgb(tokens['--surface-panel']!),
      borderWidth: '1px',
    };

    /** 箱の面と枠を読む */
    const surface = (testId: string): Promise<{ background: string; borderWidth: string }> =>
      page.getByTestId(testId).evaluate((element) => {
        const own = getComputedStyle(element);
        return { background: own.backgroundColor, borderWidth: own.borderTopWidth };
      });

    /*
     * プレビューの箱は承認画面（`approvals/[approvalId].vue`）が持つ。承認画面だけ枠が要る:
     * 本家の `ApprovalsAnnotator` は外側の承認カードの中にもう1枚
     * `bg-panel border rounded-lg` を置き、どの面でも同じ枠に本文を入れる。
     * 仕様書・ステアリングの画面（`SpecViewerPage`）はパネル1枚なので枠を重ねない。
     */
    expect(await surface('approval-document')).toEqual(expected);

    // 面は2つ（プレビュー / 生テキスト）。並べる面は無い（specs/project/ui）
    await page.getByTestId('approval-mode-annotate').click();
    expect(await surface('approval-body')).toEqual(expected);
    await expect(page.getByTestId('approval-mode-side-by-side')).toHaveCount(0);
  });

  /**
   * 本家の segmented control（`ApprovalsPage` の View Mode Tabs）。
   * 塗るのは選んでいる1つだけで、残りは塗らない。3つとも塗ると、どれが選ばれているか
   * 見て分からない。
   */
  test('面の切替は本家の segmented control と同じ形', async ({ page }) => {
    await stub.requestApproval(ALPHA, {
      id: 'region2',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(`/projects/${ALPHA}/approvals/region2`);

    const tokens = await resolvedTokens(page, [
      '--surface-panel',
      '--border-default',
      '--radius-lg',
      '--radius-md',
      '--accent-primary',
      '--text-muted',
    ]);

    const band = await page.getByTestId('approval-modes').evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        display: own.display,
        background: own.backgroundColor,
        borderWidth: own.borderTopWidth,
        radius: own.borderTopLeftRadius,
        padding: own.paddingTop,
        shadow: own.boxShadow,
      };
    });

    // 本家: `inline-flex bg-[var(--surface-panel)] rounded-lg p-1 shadow-sm border`
    expect(band.display).toBe('inline-flex');
    expect(band.background).toBe(hexToRgb(tokens['--surface-panel']!));
    expect(band.borderWidth).toBe('1px');
    expect(band.radius).toBe(tokens['--radius-lg']);
    expect(band.padding).toBe('4px');
    expect(band.shadow).not.toBe('none');

    const item = (mode: string): Promise<{ background: string; color: string; padding: string; radius: string }> =>
      page.getByTestId(`approval-mode-${mode}`).evaluate((element) => {
        const own = getComputedStyle(element);
        return {
          background: own.backgroundColor,
          color: own.color,
          padding: [own.paddingTop, own.paddingLeft].join(' '),
          radius: own.borderTopLeftRadius,
        };
      });

    // 選んでいるものだけアクセントで塗り、白に抜く
    const on = await item('preview');
    expect(on.background).toBe(hexToRgb(tokens['--accent-primary']!));
    expect(on.color).toBe('rgb(255, 255, 255)');
    // 本家のボタンは `px-3 py-1.5 rounded-md`
    expect(on.padding).toBe('6px 12px');
    expect(on.radius).toBe(tokens['--radius-md']);

    // 選んでいないものは塗らない
    const off = await item('annotate');
    expect(off.background).toBe('rgba(0, 0, 0, 0)');
    expect(off.color).toBe(hexToRgb(tokens['--text-muted']!));
  });
});

/**
 * サイドバーの寸法。値は稼働中の本家（`PageNavigationSidebar`）から実測して写している。
 * 幅は `design-token.spec.ts` が押さえるので、ここは中の作りを見る。
 */
test.describe('下層のサイドバーは本家の作りと同じ', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}`);
  });

  test('畳むボタンの行は本家と同じ余白と線を持つ', async ({ page }) => {
    const tokens = await resolvedTokens(page, ['--border-default', '--radius-md']);

    const head = await page.locator('.sb-sidebar-head').evaluate((element) => {
      const own = getComputedStyle(element);
      const button = element.querySelector('button')!;
      const buttonStyle = getComputedStyle(button);
      const box = button.getBoundingClientRect();
      const icon = button.querySelector('svg')!.getBoundingClientRect();
      return {
        padding: own.paddingTop,
        borderBottomWidth: own.borderBottomWidth,
        borderBottomColor: own.borderBottomColor,
        buttonWidth: Math.round(box.width),
        buttonHeight: Math.round(box.height),
        buttonPadding: buttonStyle.paddingTop,
        buttonRadius: buttonStyle.borderTopLeftRadius,
        iconWidth: Math.round(icon.width),
      };
    });

    // 本家: `p-4 border-b border-[var(--border-default)]`
    expect(head.padding).toBe('16px');
    expect(head.borderBottomWidth).toBe('1px');
    expect(head.borderBottomColor).toBe(hexToRgb(tokens['--border-default']!));
    // 本家のボタン: `p-1.5 rounded-md` に 20px の絵 = 32px 四方
    expect(head.buttonWidth).toBe(32);
    expect(head.buttonHeight).toBe(32);
    expect(head.buttonPadding).toBe('6px');
    expect(head.buttonRadius).toBe(tokens['--radius-md']);
    expect(head.iconWidth).toBe(20);
  });

  test('項目は本家と同じ寸法（36px・絵 20px・間 4px）', async ({ page }) => {
    const shape = await page.evaluate(() => {
      const nav = document.querySelector('.sb-sidebar-nav')!;
      const links = [...nav.querySelectorAll('a')];
      const first = getComputedStyle(links[0]!);
      const boxes = links.map((link) => link.getBoundingClientRect());
      return {
        navPadding: getComputedStyle(nav).paddingTop,
        padding: [first.paddingTop, first.paddingLeft].join(' '),
        gap: first.columnGap,
        radius: first.borderTopLeftRadius,
        height: Math.round(boxes[0]!.height),
        between: Math.round(boxes[1]!.top - boxes[0]!.bottom),
        iconWidth: Math.round(links[0]!.querySelector('svg')!.getBoundingClientRect().width),
        labelFontSize: getComputedStyle(links[0]!.querySelector('span')!).fontSize,
        labelWeight: getComputedStyle(links[0]!.querySelector('span')!).fontWeight,
      };
    });

    // 本家の nav: `p-4 space-y-1`、項目: `py-2 px-3 gap-3 rounded-md` に 20px の絵
    expect(shape.navPadding).toBe('16px');
    expect(shape.padding).toBe('8px 12px');
    expect(shape.gap).toBe('12px');
    expect(shape.radius).toBe('6px');
    expect(shape.height).toBe(36);
    expect(shape.between).toBe(4);
    expect(shape.iconWidth).toBe(20);
    // ラベルは `text-sm font-medium`。実測 12px / 500
    expect(shape.labelFontSize).toBe('12px');
    expect(shape.labelWeight).toBe('500');
  });

  /**
   * 本家は `transition-all duration-200 ease-in-out` で幅を変える。Tailwind の `ease-in-out` は
   * cubic-bezier(0.4, 0, 0.2, 1) で、CSS の同名キーワード（0.42, 0, 0.58, 1）とは別物である。
   */
  test('畳む動きは本家と同じ 200ms・同じ曲線', async ({ page }) => {
    const style = await page.getByTestId('workspace-sidebar').evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        property: own.transitionProperty,
        duration: own.transitionDuration,
        timing: own.transitionTimingFunction,
      };
    });

    expect(style.property).toContain('width');
    expect(style.duration).toBe('0.2s');
    expect(style.timing).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });
});

test.describe('状態と進捗の表示が本家と同じ', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  /*
   * 本家 CSS の `.status-badge` は**本家のどの画面からも使われていない**
   * （`grep -rn 'className="[^"]*\bstatus-badge\b' src --include=*.tsx` が 0 件。定義だけが
   * tailwind.css に残っている）。実際に画面へ出ているバッジは
   * `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium` の直書きで、
   * 稼働中の本家（`/#/steering`）で実測すると 11px / 500 / lh 14.6667px / padding 4px 8px。
   *
   * 行送りは `text-xs` に付いてくる `--text-xs--line-height`（= 1/0.75）。定義側の
   * `line-height: 1.4` を写していたときは 15.4px で本家より 1px 高かった。
   * 定義ではなく、実際にそう見えている方を固定する。
   */
  test('状態バッジの寸法が本家の一覧バッジと同じ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    const tokens = await resolvedTokens(page, ['--text-xs']);

    const style = await page.locator('.sb-status-badge').first().evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        display: own.display,
        fontSize: own.fontSize,
        fontWeight: own.fontWeight,
        lineHeight: own.lineHeight,
        radius: own.borderTopLeftRadius,
        paddingTop: own.paddingTop,
        paddingLeft: own.paddingLeft,
      };
    });

    expect(style.display).toBe('inline-flex');
    expect(style.fontSize).toBe(tokens['--text-xs']);
    expect(style.fontWeight).toBe('500');
    // 実測 11px / 14.6667px
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * (1 / 0.75),
      1,
    );
    expect(style.paddingTop).toBe('4px');
    expect(style.paddingLeft).toBe(upstreamRootToken('--space-2'));
  });

  test('ステアリングの有無は success と pending の2色で出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    const tokens = await resolvedTokens(page, ['--status-pending']);

    /*
     * `RecordList` は `UTable` に載っており、`tr` に任意の属性を張れない。行は
     * 押せる／押せないを示す class（`.sb-datarow` / `.sb-datarow-off`）で指す。
     */
    const rows = page.locator('tr.sb-datarow, tr.sb-datarow-off');

    const available = await rows
      .filter({ hasText: 'product.md' })
      .locator('.sb-status-badge')
      .evaluate((element) => getComputedStyle(element).color);

    const missing = await rows
      .filter({ hasText: 'structure.md' })
      .locator('.sb-status-badge')
      .evaluate((element) => getComputedStyle(element).color);

    /*
     * 有無の色は本家の一覧バッジに合わせる。本家はここを Tailwind の直書き
     * （`dark:text-green-400`）で塗っており、design token の `--status-success`
     * （green-500）とは別の色になる。稼働中の本家で実測した green-400 を固定する。
     * トークン側は接続 dot などで使うので、そちらは変えていない。
     */
    expect(available).toBe('oklch(0.792 0.209 151.711)');
    expect(missing).toBe(hexToRgb(tokens['--status-pending']!));
  });

  /*
   * 本家 CSS の `.progress-track` / `.progress-fill` も**使われていない定義**
   * （`grep -rn "progress-track" src` のヒットは tailwind.css だけ）。高さ 6px はそこから
   * 写していた値で、画面に出ている本家のバーとは違う。
   *
   * 本家が実際に出しているのは `SpecsPage.tsx` の
   * 溝 `w-20 bg-[var(--surface-sunken)] rounded-full h-2` ＋
   * 中身 `bg-[var(--interactive-primary)] h-2 rounded-full`。
   * 稼働中の本家（`/#/specs`）へ同じ markup を差して実測すると 80x8 / 全周角丸。
   */
  test('進捗バーが本家の一覧のバーと同じ寸法で出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks/auth-spec`);

    const tokens = await resolvedTokens(page, ['--surface-inset', '--interactive-primary']);

    const track = await page.locator('.sb-progress-track').first().evaluate((element) => {
      const own = getComputedStyle(element);
      const fill = getComputedStyle(element.querySelector('.sb-progress-fill')!);
      return {
        height: own.height,
        background: own.backgroundColor,
        overflow: own.overflow,
        radius: own.borderTopLeftRadius,
        fillHeight: fill.height,
        fillRadius: fill.borderTopLeftRadius,
        fillBackground: fill.backgroundColor,
      };
    });

    expect(track.height).toBe('8px');
    expect(track.fillHeight).toBe('8px');
    expect(track.background).toBe(hexToRgb(tokens['--surface-inset']!));
    expect(track.overflow).toBe('hidden');
    // 溝も中身も全周が丸い（`rounded-full`）
    expect(Number.parseFloat(track.radius)).toBeGreaterThanOrEqual(9999);
    expect(Number.parseFloat(track.fillRadius)).toBeGreaterThanOrEqual(9999);
    expect(track.fillBackground).toBe(hexToRgb(tokens['--interactive-primary']!));
  });

  test('タスクの状態は面を塗らず点の色で示す（本家の statusPill）', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks/auth-spec`);

    const tokens = await resolvedTokens(page, ['--surface-panel']);

    const pill = await page.locator('.sb-status-pill').first().evaluate((element) => {
      const own = getComputedStyle(element);
      const dot = getComputedStyle(element.querySelector('.sb-status-dot')!);
      return {
        background: own.backgroundColor,
        dotWidth: dot.width,
        dotBackground: dot.backgroundColor,
      };
    });

    // 面はパネル面のまま。状態ごとに塗り分けない
    expect(pill.background).toBe(hexToRgb(tokens['--surface-panel']!));
    expect(pill.dotWidth).toBe('8px');
    // 色は点だけが持つ
    expect(pill.dotBackground).not.toBe(pill.background);
  });
});

/**
 * 下層の一覧は `UTable` に載せている。様式は本家の一覧（`SteeringPage.tsx` の table と
 * `SteeringDocumentRow`）のままで、@nuxt/ui の既定テーマは `:ui` で外してある。
 * 既定の utility（`p-4` / `divide-y` / `text-muted` など）が残ると utilities layer が
 * `.sb-datatable`（components layer）を上書きするので、稼働中の画面から寸法を読んで押さえる。
 */
test.describe('下層の一覧は本家の表と同じ', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}/steering`);
  });

  test('枠・見出し・セルの寸法が本家と同じ', async ({ page }) => {
    const tokens = await resolvedTokens(page, [
      '--border-default',
      '--surface-sunken',
      '--radius-lg',
      '--text-muted',
    ]);

    const style = await page.locator('table.sb-datatable').evaluate((table) => {
      const own = getComputedStyle(table);
      const thead = getComputedStyle(table.querySelector('thead')!);
      const th = getComputedStyle(table.querySelector('thead th')!);
      const rows = table.querySelectorAll('tbody tr');
      const td = getComputedStyle(rows[0]!.querySelector('td')!);
      const second = getComputedStyle(rows[1]!.querySelector('td')!);

      return {
        borderWidth: own.borderTopWidth,
        borderColor: own.borderTopColor,
        radius: own.borderTopLeftRadius,
        theadBackground: thead.backgroundColor,
        thPadding: [th.paddingTop, th.paddingRight, th.paddingBottom, th.paddingLeft].join(' '),
        thColor: th.color,
        thTransform: th.textTransform,
        thWeight: th.fontWeight,
        tdPadding: [td.paddingTop, td.paddingRight, td.paddingBottom, td.paddingLeft].join(' '),
        tdAlign: td.verticalAlign,
        separator: second.borderTopWidth,
      };
    });

    // 本家の table は `border border-[var(--border-default)] rounded-lg`
    expect(style.borderWidth).toBe('1px');
    expect(style.borderColor).toBe(hexToRgb(tokens['--border-default']!));
    expect(style.radius).toBe(tokens['--radius-lg']);
    // 本家の thead は `bg-[var(--surface-sunken)]`
    expect(style.theadBackground).toBe(hexToRgb(tokens['--surface-sunken']!));
    /*
     * 本家の th は `px-4 py-3 font-medium text-[var(--text-muted)] uppercase`。
     * 1列目の左だけ 24px にしている（`.sb-datatable th:first-child` の意図的な逸脱）。
     */
    expect(style.thPadding).toBe('12px 16px 12px 24px');
    expect(style.thColor).toBe(hexToRgb(tokens['--text-muted']!));
    expect(style.thTransform).toBe('uppercase');
    expect(style.thWeight).toBe('500');
    // 本家の td は `px-4 py-4`
    expect(style.tdPadding).toBe('16px 16px 16px 16px');
    expect(style.tdAlign).toBe('middle');
    // 行の区切りは本家の `divide-y divide-[var(--border-default)]` と同じ 1px
    expect(style.separator).toBe('1px');
  });

  test('行頭は 40px のタイル、テキストは2段、右端は目のアイコン', async ({ page }) => {
    const shape = await page
      .locator('tr.sb-datarow')
      .first()
      .evaluate((row) => {
        const cells = row.querySelectorAll('td');
        const tile = cells[0]!.querySelector('.sb-icon-tile')!.getBoundingClientRect();
        const tileIcon = cells[0]!
          .querySelector('.sb-icon-tile > svg')!
          .getBoundingClientRect();
        const text = cells[0]!.querySelector('.sb-icon-tile')!.nextElementSibling!;
        const label = text.children[0]!.getBoundingClientRect();
        const detail = text.children[1]!.getBoundingClientRect();
        const eye = cells[cells.length - 1]!.querySelector('svg')!.getBoundingClientRect();

        return {
          tileWidth: tile.width,
          tileHeight: tile.height,
          tileIconWidth: tileIcon.width,
          tileIconHeight: tileIcon.height,
          labelBottom: label.bottom,
          detailTop: detail.top,
          eyeWidth: eye.width,
          eyeHeight: eye.height,
        };
      });

    // 本家は `w-10 h-10` のタイルに `w-5 h-5` のアイコン
    expect(Math.round(shape.tileWidth)).toBe(40);
    expect(Math.round(shape.tileHeight)).toBe(40);
    expect(Math.round(shape.tileIconWidth)).toBe(20);
    expect(Math.round(shape.tileIconHeight)).toBe(20);

    // 名前と補足は縦に2段。横に並ばない
    expect(shape.detailTop).toBeGreaterThanOrEqual(shape.labelBottom);

    // 本家は行の右端に `w-5 h-5` の目のアイコンを置く
    expect(Math.round(shape.eyeWidth)).toBe(20);
    expect(Math.round(shape.eyeHeight)).toBe(20);
  });

  test('列見出しは呼び出し側の文言で4列、本家に無い行を足さない', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/specs`);

    const list = page.getByTestId('specs-list');

    const headers = await list.locator('thead th').allTextContents();
    expect(headers.map((text) => text.trim())).toEqual([
      'Feature',
      '進捗',
      '最終更新',
      'アクション',
    ]);

    // `UTable` が thead に差し込む 1px の線。本家は thead の背景で区切るので出さない
    await expect(list.locator('thead [data-slot="separator"]')).toBeHidden();
    // 行は仕様書の数だけ。空行や区切り行が tbody に混ざらない
    await expect(list.locator('tbody tr')).toHaveCount(1);
  });
});

test.describe('本文が markdown として描かれる', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}/steering/product`);
  });

  /*
   * 本文の型は Tailwind Typography（`prose`）。
   *
   * 本家 `theme.css` の `.markdown-content` を写していたが、あの class は**本家のどの
   * `.tsx` も名乗っていない**（`grep -rn "markdown-content" src` のヒットは theme.css だけ）。
   * 本家が本文へ当てているのは `MDXEditorWrapper.tsx` の `contentEditableClassName`＝
   * `prose prose-sm sm:prose-base max-w-none dark:prose-invert …` で、
   * `DocumentView.vue` はその並びをそのまま名乗っている。
   *
   * 期待値は稼働中の本家（`/#/specs/view`、1440x900）の実測:
   *   本文 16px / lh 28px、h1 36px / 800 / 下 32px、h2 24px / 700 / 上 48px 下 24px、
   *   h3 20px / 600、p 下 20px、ul 上下 20px・左 26px、li 上下 8px、hr 上下 48px。
   * 写していたときは h1 も h2 も 16px、p の余白 8px、hr 16px で、本家と別物だった。
   */
  test('本文の型は本家と同じ prose（prose-sm sm:prose-base dark:prose-invert）', async ({
    page,
  }) => {
    const body = page.getByTestId('document-content');

    // 本家と同じ class 列を名乗っている（写した数値ではなく同じ生成物に載る）
    await expect(body).toHaveClass(/(^|\s)prose(\s|$)/);
    await expect(body).toHaveClass(/prose-sm/);
    await expect(body).toHaveClass(/sm:prose-base/);
    await expect(body).toHaveClass(/dark:prose-invert/);

    const style = await body.evaluate((element) => {
      const read = (selector: string | null) => {
        const target = selector === null ? element : element.querySelector(selector);
        if (target === null) return null;
        const own = getComputedStyle(target);
        return {
          fontSize: own.fontSize,
          fontWeight: own.fontWeight,
          lineHeight: own.lineHeight,
          marginTop: own.marginTop,
          marginBottom: own.marginBottom,
          paddingLeft: own.paddingLeft,
        };
      };
      return {
        root: read(null),
        h1: read('h1'),
        h2: read('h2'),
        p: read('p'),
        ul: read('ul'),
        li: read('ul > li'),
      };
    });

    // 1440px（sm 以上）では `sm:prose-base` が効いて本文は 16px / 28px
    expect(style.root!.fontSize).toBe('16px');
    expect(style.root!.lineHeight).toBe('28px');

    expect(style.h1!.fontSize).toBe('36px');
    expect(style.h1!.fontWeight).toBe('800');
    expect(style.h1!.marginBottom).toBe('32px');

    expect(style.h2!.fontSize).toBe('24px');
    expect(style.h2!.fontWeight).toBe('700');
    expect(style.h2!.marginTop).toBe('48px');
    expect(style.h2!.marginBottom).toBe('24px');

    expect(style.p!.marginBottom).toBe('20px');
    expect(style.ul!.marginTop).toBe('20px');
    expect(style.ul!.paddingLeft).toBe('26px');
    expect(style.li!.marginTop).toBe('8px');
  });

  /*
   * 本文の面。本家は contentEditable の入れ物に #111827 を敷き、内側 12px から本文が始まる
   * （`MDXEditorWrapper.css` の `.mdxeditor-root-contenteditable` ＋ `_contentEditable_`）。
   * パネル（#1e293b）の中に一段暗い矩形が入るのが本家の見え方。
   */
  test('本文はパネルの中の一段暗い面に載る', async ({ page }) => {
    const style = await page.getByTestId('document-content').evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        background: own.backgroundColor,
        padding: own.paddingTop,
        minHeight: own.minHeight,
      };
    });

    expect(style.background).toBe(hexToRgb('#111827'));
    expect(style.padding).toBe('12px');
    expect(style.minHeight).toBe('200px');
  });

  test('見出し・箇条書き・表・コードブロックが要素になる', async ({ page }) => {
    const body = page.getByTestId('document-content');

    await expect(body.locator('h1')).toHaveText('product');
    await expect(body.locator('ul > li')).toHaveCount(2);
    await expect(body.locator('table th')).toHaveCount(2);
    await expect(body.locator('pre > code')).toContainText('コードブロック');
    await expect(body.locator(':not(pre) > code')).toContainText('インラインコード');
  });

  /*
   * 表。本家の表は prose ではなく MDXEditor の table editor（`_tableEditor_` /
   * `_leftAlignedCell_`）が描いている。`MDXEditorWrapper.css` にも表の指定はあるが
   * （padding .5rem 1rem / border #374151）、あとから読まれる `@mdxeditor/editor` の
   * scoped CSS が同じ強さで上書きするので、画面に出ているのは下の値のほう。
   *
   * 稼働中の本家（`/#/specs/view?name=connect-portal-and-strokes&doc=design`）で実測:
   *   table 14px / lh 24px / 上下 16px、セル padding 4px 8px / 罫線 1px rgb(46,49,53)、
   *   th は 600 / 白 / 面 #1f2937。
   */
  test('表の罫線と余白が本家の MDXEditor の表と同じ', async ({ page }) => {
    const style = await page.getByTestId('document-content').evaluate((element) => {
      const read = (selector: string) => {
        const target = element.querySelector(selector);
        if (target === null) return null;
        const own = getComputedStyle(target);
        return {
          fontSize: own.fontSize,
          fontWeight: own.fontWeight,
          color: own.color,
          background: own.backgroundColor,
          borderWidth: own.borderTopWidth,
          borderColor: own.borderTopColor,
          padding: `${own.paddingTop} ${own.paddingRight}`,
          textAlign: own.textAlign,
          marginTop: own.marginTop,
        };
      };
      return { table: read('table'), th: read('table th'), td: read('table td') };
    });

    expect(style.table!.fontSize).toBe('14px');
    expect(style.table!.marginTop).toBe('16px');

    expect(style.th!.borderWidth).toBe('1px');
    expect(style.th!.borderColor).toBe('rgb(46, 49, 53)');
    expect(style.th!.padding).toBe('4px 8px');
    expect(style.th!.background).toBe(hexToRgb('#1f2937'));
    expect(style.th!.color).toBe('rgb(255, 255, 255)');
    expect(style.th!.fontWeight).toBe('600');
    expect(style.th!.textAlign).toBe('left');

    expect(style.td!.borderWidth).toBe('1px');
    expect(style.td!.borderColor).toBe('rgb(46, 49, 53)');
    expect(style.td!.padding).toBe('4px 8px');
  });

  /*
   * インラインコード。本家は Lexical が `code > span._code_` の二重構造で出し、
   * 目に入るのは内側の span（実測: 本文 16px の中で 13.16px / 600 / 面 rgb(33,34,37) /
   * padding 1px 4px / 角丸なし）。前後のバッククォートは prose の `code::before/::after`。
   * MDC は `code` 1枚しか出さないので、見えている側の値をその `code` に持たせている。
   */
  test('インラインコードが本家と同じ大きさ・面・バッククォート付きで出る', async ({ page }) => {
    const style = await page
      .getByTestId('document-content')
      .locator(':not(pre) > code')
      .first()
      .evaluate((element) => {
        const own = getComputedStyle(element);
        return {
          fontSize: own.fontSize,
          fontWeight: own.fontWeight,
          background: own.backgroundColor,
          padding: `${own.paddingTop} ${own.paddingRight}`,
          radius: own.borderTopLeftRadius,
          before: getComputedStyle(element, '::before').content,
          after: getComputedStyle(element, '::after').content,
          parentFontSize: getComputedStyle(element.parentElement!).fontSize,
        };
      });

    // 本文 16px に対して 0.875em（prose）× 0.94（MDXEditor の `_code_`）＝ 13.16px
    expect(Number.parseFloat(style.fontSize)).toBeCloseTo(
      Number.parseFloat(style.parentFontSize) * 0.8225,
      1,
    );
    expect(style.fontWeight).toBe('600');
    expect(style.background).toBe('rgb(33, 34, 37)');
    expect(style.padding).toBe('1px 4px');
    expect(style.radius).toBe('0px');
    // 本家は prose の既定どおり前後にバッククォートが出る
    expect(style.before).toBe('"`"');
    expect(style.after).toBe('"`"');
  });

  /*
   * mermaid フェンスは図（SVG）になる。本家（`mermaidPlugin.tsx`）は npm の `mermaid` を
   * 呼んで SVG を差し込んでおり、生ソースのコードブロックのままにはしない。
   *
   * mermaid は DOM の計測を使うのでサーバでは描けない。SSR では「Loading diagram...」の
   * 枠だけを出し、hydration の後に SVG へ差し替わる。だから待ってから見る。
   */
  test('mermaid フェンスは生ソースではなく SVG の図になる', async ({ page }) => {
    const body = page.getByTestId('document-content');
    const diagram = body.getByTestId('mermaid-diagram');

    // mermaid の読み込みと描画は hydration の後なので、既定の 5 秒より長めに待つ
    await expect(diagram).toBeVisible({ timeout: 15_000 });
    await expect(diagram.locator('svg')).toBeVisible();

    // 生ソースのコードブロックとしては残らない
    // `language` は `ProsePre` の props に吸われるので、`MarkdownFence` が `data-language` で出す
    await expect(body.locator('pre[data-language="mermaid"]')).toHaveCount(0);
    await expect(body).not.toContainText('flowchart LR');

    // 図の中身が絵になっている（節と線が SVG の要素として出ている）
    const svg = diagram.locator('svg');
    await expect(svg).toHaveAttribute('aria-roledescription', 'flowchart-v2');
    await expect(svg.locator('g.node, .node')).toHaveCount(2);
    expect(await svg.locator('path').count()).toBeGreaterThan(0);
    // 節のラベルは図の中の文字として出る
    await expect(svg).toContainText('はじめ');
    await expect(svg).toContainText('おわり');

    // 描き終わったら待ちの枠もエラー面も残らない
    await expect(body.getByTestId('mermaid-loading')).toHaveCount(0);
    await expect(body.getByTestId('mermaid-error')).toHaveCount(0);
  });

  /*
   * 図の入れ物は本家の `.mermaid-container` の写し。値の出どころは本家の
   * `mermaidPlugin.tsx` の className と `MDXEditorWrapper.css` の重ね（ダーク時）。
   */
  test('図の入れ物が本家の .mermaid-container と同じ形で出る', async ({ page }) => {
    const diagram = page.getByTestId('document-content').getByTestId('mermaid-diagram');
    await expect(diagram.locator('svg')).toBeVisible({ timeout: 15_000 });

    const style = await diagram.evaluate((element) => {
      const own = getComputedStyle(element);
      const svg = element.querySelector('svg')!;
      return {
        display: own.display,
        justifyContent: own.justifyContent,
        background: own.backgroundColor,
        padding: own.paddingTop,
        borderRadius: own.borderTopLeftRadius,
        borderWidth: own.borderTopWidth,
        margin: own.marginTop,
        overflow: own.overflowX,
        svgWidth: svg.getAttribute('width'),
        svgMaxWidth: getComputedStyle(svg).maxWidth,
        // 入れ物の内側に収まる（横に溢れない）
        fits: svg.getBoundingClientRect().width <= element.getBoundingClientRect().width,
      };
    });

    // 本家 MDXEditorWrapper.css: display:flex / justify-content:center / padding:1rem
    //                            / border-radius:0.5rem / dark は background #1f2937
    expect(style.display).toBe('flex');
    expect(style.justifyContent).toBe('center');
    expect(style.background).toBe(hexToRgb('#1f2937'));
    expect(style.padding).toBe('16px');
    expect(style.borderRadius).toBe('8px');
    // 本家 className: border（1px）/ my-4（16px）/ overflow-auto
    expect(style.borderWidth).toBe('1px');
    expect(style.margin).toBe('16px');
    expect(style.overflow).toBe('auto');

    // 本家の SVG は width="100%" ＋ インラインの max-width が実寸。入れ物の幅までで原寸表示
    expect(style.svgWidth).toBe('100%');
    expect(style.svgMaxWidth).toMatch(/^\d/);
    expect(style.fits).toBe(true);
  });

  /*
   * mermaid はサーバでは描けない（DOM の計測が要る）。それでも本文の SSR は止めない。
   * サーバが返す HTML には本文と、図の場所を取る待ちの枠が入っている。
   */
  test('SSR の HTML には本文と図の待ち枠が入る', async ({ page }) => {
    const html = await (await page.request.get(`/projects/${ALPHA}/steering/product`)).text();

    // 本文はサーバ側で出ている（図が出るのを待たずに読める）
    expect(html).toContain('インラインコード');
    // 図の場所は待ちの枠で取ってある
    expect(html).toContain('Loading diagram...');
    // 生ソースのコードブロックとしては入っていない
    expect(html).not.toContain('language="mermaid"');
  });

  test('mermaid 以外のコードブロックは pre のまま残る', async ({ page }) => {
    const body = page.getByTestId('document-content');

    // 図の差し替えは mermaid だけ。ts のフェンスは shiki のコードブロックのまま
    const code = body.locator('pre[data-language="ts"]');
    await expect(code).toHaveCount(1);
    await expect(code.locator('code')).toContainText('コードブロック');
    await expect(code).toHaveClass(/shiki/);
  });

  test('文書に混ざった生 HTML は描かず、実行もしない', async ({ page }) => {
    const body = page.getByTestId('document-content');

    await expect(body.locator('img')).toHaveCount(0);
    await expect(body.locator('script')).toHaveCount(0);

    // タグがテキストとして漏れてもいない
    await expect(body).not.toContainText('onerror');
    await expect(body).not.toContainText('<script>');

    const executed = await page.evaluate(() => '__xss' in window);
    expect(executed).toBe(false);
  });
});

/**
 * 本家の JSX には `btn bg-green-600` / `btn bg-red-600` と書いてあるが、本家自身の
 * `.btn` が素のクラスとして `background: var(--interactive-primary)` を持つため、
 * Tailwind の `bg-*` が打ち消されて実際は3つとも indigo で描かれる。
 * ソースを読んで緑や赤にすると本家と違う見た目になるので、ここで固定する。
 */
test.describe('承認画面の操作は本家と同じ見た目', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await stub.requestApproval(ALPHA, {
      id: 'style3',
      title: 'ステアリング: product.md の承認',
      filePath: '.spec-workflow/steering/product.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await page.goto(`/projects/${ALPHA}/approvals`);
  });

  test('承認も却下もアクセント1色。種別で色を撒かない', async ({ page }) => {
    const tokens = await resolvedTokens(page, ['--interactive-primary']);
    const accent = hexToRgb(tokens['--interactive-primary']!);

    for (const testId of ['record-open', 'approval-approve', 'approval-reject']) {
      const background = await page
        .getByTestId(testId)
        .evaluate((element) => getComputedStyle(element).backgroundColor);

      expect(background, `${testId} の色`).toBe(accent);
    }
  });

  test('ボタンの寸法は本家の .btn と同じ', async ({ page }) => {
    const style = await page.getByTestId('approval-approve').evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        padding: own.padding,
        fontWeight: own.fontWeight,
        radius: own.borderTopLeftRadius,
        height: Math.round(element.getBoundingClientRect().height),
      };
    });

    // 本家 `.btn` は padding: var(--space-2) var(--space-3) / font-weight: 500 / radius-md
    expect(style.padding).toBe('8px 12px');
    expect(style.fontWeight).toBe('500');
    expect(style.radius).toBe('6px');
    expect(style.height).toBe(35);
  });
});

test.describe('トーストは本家の NotificationToasts と同じ形', () => {
  /**
   * 描画は @nuxt/ui の `UToast` が持つので、セレクタは `data-slot` で取る
   * （design.md 決定8）。本体は viewport（`<ol>`）直下の `<li>`。
   */
  const toasts = (page: Page): Locator => page.locator('ol[data-slot="viewport"] > li');
  const dismiss = (page: Page): Locator => toasts(page).locator('button[data-slot="close"]');

  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('角丸・余白・枠が本家と同じ', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    const style = await toasts(page).evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        radius: own.borderTopLeftRadius,
        padding: own.paddingTop,
        borderWidth: own.borderTopWidth,
        boxShadow: own.boxShadow,
      };
    });

    // 本家は rounded-lg p-4 shadow-lg border
    expect(style.radius).toBe('8px');
    expect(style.padding).toBe('16px');
    expect(style.borderWidth).toBe('1px');
    expect(style.boxShadow).not.toBe('none');
  });

  test('種別ごとのアイコンが出る', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // 完了は success。本家は check-circle。
    // アイコン名は DOM に出ないので、本家から写したパスそのもので絞る
    await expect(
      toasts(page).locator(`svg.iconify--upstream path[d="${UPSTREAM_PATH.checkCircle}"]`),
    ).toHaveCount(1);

    await dismiss(page).click();
    await expect(toasts(page)).toHaveCount(0);

    await stub.requestApproval(ALPHA, {
      id: 'style1',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await expect(toasts(page)).toHaveCount(1);
    await expect(
      toasts(page).locator(`svg.iconify--upstream path[d="${UPSTREAM_PATH.infoCircle}"]`),
    ).toHaveCount(1);
  });

  test('種別で色が変わる。ここだけ indigo 集約の外', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    const success = await toasts(page).evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );

    await dismiss(page).click();
    await expect(toasts(page)).toHaveCount(0);

    await stub.requestApproval(ALPHA, {
      id: 'style2',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(toasts(page)).toHaveCount(1);

    const info = await toasts(page).evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );

    expect(success).not.toBe(info);
  });

  test('× の絵が本家と同じ', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(toasts(page)).toHaveCount(1);

    // 本家の × は `M6 18L18 6M6 6l12 12`。@nuxt/ui 既定（lucide の x）には流れさせない
    await expect(
      dismiss(page).locator(`svg.iconify--upstream path[d="${UPSTREAM_PATH.close}"]`),
    ).toHaveCount(1);
  });
});

/** 本家の CSS は hex で書かれ、画面から読める値は rgb() になる */
function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((character) => character + character)
          .join('')
      : value;

  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
