import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/**
 * 本家の design token が実際に描画へ効いているかを、稼働中の画面から読む。
 *
 * 期待値は本家の CSS バンドル（archive の steering-dashboard-portal/prototype/assets/
 * spec-workflow.css）の `.dark` ブロックから直接読む。ここに数値を書き写すと、本家が
 * 変わったときにテストだけが古い値で通り続ける。
 */

const UPSTREAM_CSS = join(
  process.cwd(),
  'openspec/changes/archive/2026-08-20-steering-dashboard-portal/prototype/assets/spec-workflow.css',
);

/** 本家の `.dark` ブロックからトークンを読む */
function upstreamDarkTokens(): Record<string, string> {
  const css = readFileSync(UPSTREAM_CSS, 'utf-8');
  const block = css.match(/\.dark\{([^}]*)\}/);

  if (block === null) throw new Error('本家 CSS に .dark ブロックが無い');

  return Object.fromEntries(
    block[1]!
      .split(';')
      .map((declaration) => declaration.split(':'))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([name, value]) => [name!.trim(), value!.trim()]),
  );
}

/** 本家の型スケール。Tailwind の既定より一段小さい */
function upstreamTypeScale(): Record<string, string> {
  const css = readFileSync(UPSTREAM_CSS, 'utf-8');
  const scale: Record<string, string> = {};

  for (const match of css.matchAll(/--text-(xs|sm|base|lg|xl):\s*(\d+)px/g)) {
    scale[`--text-${match[1]}`] = `${match[2]}px`;
  }

  return scale;
}

const TOKENS = [
  '--surface-base',
  '--surface-panel',
  '--surface-sunken',
  '--surface-hover',
  '--border-default',
  '--border-strong',
  '--interactive-primary',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--text-faint',
  '--status-success',
  '--status-info',
  '--status-warning',
  '--status-error',
  '--status-in-progress',
];

test.describe('本家の design token に合っている', () => {
  test('色トークンが本家と同じ値で解決される', async ({ page }) => {
    await page.goto('/');

    const resolved = await page.evaluate((names: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    }, TOKENS);

    const expected = upstreamDarkTokens();

    for (const token of TOKENS) {
      expect(resolved[token], `${token} が本家と違う`).toBe(expected[token]);
    }
  });

  test('型スケールが本家と同じで、Tailwind の既定ではない', async ({ page }) => {
    await page.goto('/');

    const expected = upstreamTypeScale();
    expect(Object.keys(expected).length).toBe(5);

    const resolved = await page.evaluate((names: string[]) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    }, Object.keys(expected));

    for (const [name, value] of Object.entries(expected)) {
      expect(resolved[name], `${name} が本家と違う`).toBe(value);
    }

    // Tailwind の既定（base 16px）のままになっていないこと
    expect(resolved['--text-base']).not.toBe('1rem');
  });

  test('既定でダークテーマになっている', async ({ page }) => {
    await page.goto('/');

    const className = await page.evaluate(() => document.documentElement.className);
    expect(className).toContain('dark');
  });

  test('アクセントは本家と同じ indigo-500 で、明暗で振らない', async ({ page }) => {
    await page.goto('/');

    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ui-primary').trim(),
    );

    // Nuxt UI はダークで primary-400 に落とすが、本家は indigo-500 固定
    expect(primary).toBe(upstreamDarkTokens()['--interactive-primary']);
  });

  test('一覧は本家の様式（枠・角丸・見出しの大文字化）になっている', async ({ page }) => {
    await page.goto('/projects');

    const table = page.getByTestId('projects-table');

    const style = await table.evaluate((element) => {
      const own = getComputedStyle(element);
      const header = getComputedStyle(element.querySelector('th')!);
      const cell = getComputedStyle(element.querySelector('td')!);

      return {
        borderRadius: own.borderTopLeftRadius,
        borderWidth: own.borderTopWidth,
        headerTransform: header.textTransform,
        headerSize: header.fontSize,
        headerBackground: header.backgroundColor,
        cellSize: cell.fontSize,
        cellBackground: cell.backgroundColor,
      };
    });

    expect(style.borderRadius).toBe('8px');
    expect(style.borderWidth).toBe('1px');
    expect(style.headerTransform).toBe('uppercase');
    expect(style.headerSize).toBe('11px');
    expect(style.cellSize).toBe('13px');
    // 見出しは沈んだ面、セルはパネル面
    expect(style.headerBackground).toBe('rgb(15, 23, 42)');
    expect(style.cellBackground).toBe('rgb(30, 41, 59)');
  });

  test('未接続の行は不透明度で押せないことを示す', async ({ page }) => {
    await page.goto('/projects');

    const opacity = await page
      .getByTestId('project-row')
      .filter({ hasText: 'idle-project' })
      .evaluate((row) => getComputedStyle(row).opacity);

    expect(Number(opacity)).toBeLessThan(1);
  });

  test('下層の選択中の項目は本家のアクティブ表現になっている', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001/specs');

    const style = await page
      .getByTestId('sidebar-specs')
      .evaluate((element) => {
        const own = getComputedStyle(element);
        return { background: own.backgroundColor, color: own.color };
      });

    // 本家は rgba(99,102,241,0.10〜0.15) の背景 + #6366f1 の文字（ui.md の Accessibility）
    expect(style.background).toBe('rgba(99, 102, 241, 0.15)');
    expect(style.color).toBe('rgb(99, 102, 241)');
  });
});
