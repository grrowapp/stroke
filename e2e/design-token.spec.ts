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

/**
 * アイコンは prototype のものをそのまま使う（アイコンセットの選定は決めていない）。
 * 期待値は prototype の HTML から直接読む。ここに path を書き写すと、prototype が
 * 変わったときにテストだけが古い形で通り続ける。
 */
const PROTOTYPE_HTML = join(
  process.cwd(),
  'openspec/changes/archive/2026-08-20-steering-dashboard-portal/prototype/navigation.prototype.html',
);

function prototypeIconPaths(): Record<string, string> {
  const html = readFileSync(PROTOTYPE_HTML, 'utf-8');
  const block = html.match(/const P=\{([\s\S]*?)\n\};/);

  if (block === null) throw new Error('prototype にアイコン定義が無い');

  return Object.fromEntries(
    [...block[1]!.matchAll(/(\w+):'([^']+)'/g)].map((match) => [match[1]!, match[2]!]),
  );
}

test.describe('アイコンは prototype のものを使っている', () => {
  test('prototype から 8 種類のパスが読める', () => {
    const paths = prototypeIconPaths();
    expect(Object.keys(paths).sort()).toEqual([
      'back',
      'bell',
      'down',
      'folder',
      'grid',
      'link',
      'plus',
      'x',
    ]);
  });

  test('上層のタブは bell と grid', async ({ page }) => {
    await page.goto('/');

    const expected = prototypeIconPaths();

    for (const [testId, name] of [
      ['tab-notifications', 'bell'],
      ['tab-projects', 'grid'],
    ] as const) {
      const d = await page
        .getByTestId(testId)
        .locator(`svg[data-icon="${name}"] path`)
        .getAttribute('d');

      expect(d, `${testId} のアイコンが prototype と違う`).toBe(expected[name]);
    }
  });

  test('プロジェクトの行は folder', async ({ page }) => {
    await page.goto('/projects');

    const d = await page
      .getByTestId('project-row')
      .first()
      .locator('svg[data-icon="folder"] path')
      .getAttribute('d');

    expect(d).toBe(prototypeIconPaths().folder);
  });

  test('登録は link、作成は plus', async ({ page }) => {
    await page.goto('/projects');

    const expected = prototypeIconPaths();

    for (const [testId, name] of [
      ['register-project', 'link'],
      ['create-project', 'plus'],
    ] as const) {
      const d = await page
        .getByTestId(testId)
        .locator(`svg[data-icon="${name}"] path`)
        .getAttribute('d');

      expect(d, `${testId} のアイコンが prototype と違う`).toBe(expected[name]);
    }
  });

  test('下層の戻る導線は back、プロジェクト名は folder', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001/specs');

    const expected = prototypeIconPaths();

    const back = await page
      .getByTestId('back-to-portal')
      .locator('svg[data-icon="back"] path')
      .getAttribute('d');
    expect(back).toBe(expected.back);

    const folder = await page
      .getByTestId('workspace-project-name')
      .locator('svg[data-icon="folder"] path')
      .getAttribute('d');
    expect(folder).toBe(expected.folder);
  });

  test('下層のサイドバーは prototype と同じ幅', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001/specs');

    const width = await page
      .getByTestId('workspace-sidebar')
      .evaluate((element) => getComputedStyle(element).width);

    expect(width).toBe('170px');
  });
});

test.describe('表の中身が prototype と同じ様式になっている', () => {
  test('プロジェクト一覧: アクティブは緑のチップ、未接続は無彩色', async ({ page }) => {
    await page.goto('/projects');

    const active = await page
      .getByTestId('project-row')
      .filter({ hasText: 'alpha' })
      .locator('.sb-chip')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          color: style.color,
          fontSize: style.fontSize,
          // prototype の chipOn は border を宣言していないので枠幅 0
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
        };
      });

    const idle = await page
      .getByTestId('project-row')
      .filter({ hasText: 'idle-project' })
      .locator('.sb-chip')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, fontSize: style.fontSize };
      });

    // prototype の chipOn は --status-success(#22c55e)、chipOff は --text-muted(#94a3b8)
    expect(active.color).toBe('rgb(34, 197, 94)');
    expect(active.fontSize).toBe('11px');
    expect(active.borderWidth).toBe('0px');
    expect(idle.color).toBe('rgb(148, 163, 184)');
    expect(idle.fontSize).toBe('11px');
  });

  test('プロジェクト一覧: PID と最終更新は 12px の secondary', async ({ page }) => {
    await page.goto('/projects');

    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });

    for (const testId of ['project-pid', 'project-last-modified']) {
      const style = await row.getByTestId(testId).evaluate((element) => {
        const own = getComputedStyle(element);
        return { fontSize: own.fontSize, color: own.color };
      });

      expect(style.fontSize, `${testId} の文字サイズ`).toBe('12px');
      expect(style.color, `${testId} の色`).toBe('rgb(203, 213, 225)');
    }
  });
});
