import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { ALPHA, resetBoard, stub } from './support';

/**
 * 下層とトーストが本家の様式になっているかを、稼働中の画面から読む。
 *
 * 上層は prototype が正で、それは `design-token.spec.ts` が押さえている。下層は prototype が
 * 「この問いの対象外」と書いているので、出どころは本家しかない（tasks.md 10章）。
 *
 * 期待値は本家の CSS バンドル（archive の prototype/assets/spec-workflow.css）から直接読む。
 * ここに数値を書き写すと、本家が変わったときにテストだけが古い値で通り続ける。
 */

const UPSTREAM_CSS = join(
  process.cwd(),
  'openspec/changes/archive/2026-08-20-steering-dashboard-portal/prototype/assets/spec-workflow.css',
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

    const rule = upstreamRule('.card');
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

test.describe('状態と進捗の表示が本家と同じ', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('状態バッジの寸法が本家の .status-badge と同じ', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    const rule = upstreamRule('.status-badge');
    const tokens = await resolvedTokens(page, ['--text-xs']);

    const style = await page.locator('.sb-status-badge').first().evaluate((element) => {
      const own = getComputedStyle(element);
      return {
        display: own.display,
        fontSize: own.fontSize,
        lineHeight: own.lineHeight,
        radius: own.borderTopLeftRadius,
        paddingTop: own.paddingTop,
        paddingLeft: own.paddingLeft,
      };
    });

    expect(rule.display).toBe('inline-flex');
    expect(style.display).toBe('inline-flex');
    expect(style.fontSize).toBe(tokens['--text-xs']);
    // 本家は line-height:1.4 を直接持つ
    expect(rule['line-height']).toBe('1.4');
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * 1.4,
      0,
    );
    /*
     * 本家 CSS の `.status-badge` は padding: 2px var(--space-2) を持つが、この class は
     * 本家のどの画面からも使われていない（定義だけが tailwind.css に残っている）。
     * 実際に画面へ出ているバッジは `px-2 py-1` の直書きで、稼働中の本家で実測すると 4px 8px。
     * 見えを揃えるのが目的なので、定義ではなく実際に出ている値に合わせる。
     */
    expect(rule.padding).toBe('2px var(--space-2)');
    expect(style.paddingTop).toBe('4px');
    expect(style.paddingLeft).toBe(upstreamRootToken('--space-2'));
  });

  test('ステアリングの有無は success と pending の2色で出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/steering`);

    const tokens = await resolvedTokens(page, ['--status-pending']);

    const available = await page
      .getByTestId('record-row')
      .filter({ hasText: 'product.md' })
      .locator('.sb-status-badge')
      .evaluate((element) => getComputedStyle(element).color);

    const missing = await page
      .getByTestId('record-row')
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

  test('進捗バーが本家の .progress-track と同じ寸法で出る', async ({ page }) => {
    await page.goto(`/projects/${ALPHA}/tasks/auth-spec`);

    const rule = upstreamRule('.progress-track');
    expect(rule.height).toBe('6px');

    const tokens = await resolvedTokens(page, ['--surface-inset', '--interactive-primary']);

    const track = await page.locator('.sb-progress-track').first().evaluate((element) => {
      const own = getComputedStyle(element);
      const fill = getComputedStyle(element.querySelector('.sb-progress-fill')!);
      return {
        height: own.height,
        background: own.backgroundColor,
        overflow: own.overflow,
        fillBackground: fill.backgroundColor,
      };
    });

    expect(track.height).toBe('6px');
    expect(track.background).toBe(hexToRgb(tokens['--surface-inset']!));
    expect(track.overflow).toBe('hidden');
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

test.describe('本文が markdown として描かれる', () => {
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
    await page.goto(`/projects/${ALPHA}/steering/product`);
  });

  test('本文の型は本家の .markdown-content と同じ', async ({ page }) => {
    const rule = upstreamRule('.markdown-content');
    expect(rule['font-size']).toBe('var(--text-lg)');
    expect(rule['line-height']).toBe('var(--leading-relaxed)');

    const tokens = await resolvedTokens(page, ['--text-lg']);

    const style = await page.getByTestId('document-content').evaluate((element) => {
      const own = getComputedStyle(element);
      return { fontSize: own.fontSize, lineHeight: own.lineHeight };
    });

    expect(style.fontSize).toBe(tokens['--text-lg']);
    // 本家の --leading-relaxed は 1.7
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * 1.7,
      0,
    );
  });

  test('見出し・箇条書き・表・コードブロックが要素になる', async ({ page }) => {
    const body = page.getByTestId('document-content');

    await expect(body.locator('h1')).toHaveText('product');
    await expect(body.locator('ul > li')).toHaveCount(2);
    await expect(body.locator('table th')).toHaveCount(2);
    await expect(body.locator('pre > code')).toContainText('コードブロック');
    await expect(body.locator(':not(pre) > code')).toContainText('インラインコード');
  });

  test('表の罫線は本家と同じく1本の枠で引かれる', async ({ page }) => {
    const tokens = await resolvedTokens(page, ['--surface-inset']);

    const style = await page
      .getByTestId('document-content')
      .locator('table th')
      .first()
      .evaluate((element) => {
        const own = getComputedStyle(element);
        return {
          borderWidth: own.borderTopWidth,
          background: own.backgroundColor,
          textAlign: own.textAlign,
        };
      });

    expect(style.borderWidth).toBe('1px');
    expect(style.background).toBe(hexToRgb(tokens['--surface-inset']!));
    expect(style.textAlign).toBe('left');
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
  test.beforeEach(async ({ page }) => {
    await resetBoard(page);
  });

  test('角丸・余白・枠が本家と同じ', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    const style = await page.getByTestId('toast').evaluate((element) => {
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
    await expect(page.getByTestId('toast')).toHaveCount(1);

    // 完了は success。本家は check-circle
    await expect(
      page.getByTestId('toast').locator('svg[data-upstream-icon="check-circle"]'),
    ).toHaveCount(1);

    await page.getByTestId('toast-dismiss').click();

    await stub.requestApproval(ALPHA, {
      id: 'style1',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });

    await expect(page.getByTestId('toast')).toHaveCount(1);
    await expect(
      page.getByTestId('toast').locator('svg[data-upstream-icon="info-circle"]'),
    ).toHaveCount(1);
  });

  test('種別で色が変わる。ここだけ indigo 集約の外', async ({ page }) => {
    await stub.completeTask(ALPHA);
    await expect(page.getByTestId('toast')).toHaveCount(1);

    const success = await page
      .getByTestId('toast')
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.getByTestId('toast-dismiss').click();

    await stub.requestApproval(ALPHA, {
      id: 'style2',
      title: '承認',
      filePath: '.spec-workflow/steering/tech.md',
      category: 'steering',
      categoryName: 'steering',
    });
    await expect(page.getByTestId('toast')).toHaveCount(1);

    const info = await page
      .getByTestId('toast')
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(success).not.toBe(info);
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
