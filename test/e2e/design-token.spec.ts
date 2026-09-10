import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from './support';

/**
 * 本家の design token が実際に描画へ効いているかを、稼働中の画面から読む。
 *
 * 期待値は本家の CSS バンドル（archive の steering-dashboard-portal/prototype/assets/
 * spec-workflow.css）の `.dark` ブロックから直接読む。ここに数値を書き写すと、本家が
 * 変わったときにテストだけが古い値で通り続ける。
 */

/**
 * openspec は worktree に無い。**メインの作業ツリーだけが実体を持ち**、全セッションが
 * そこを共有している（`docs/agents/issue-tracker.md`）。worktree から走らせても読めるよう、
 * 実体のある側を指す。
 */
const OPENSPEC_ROOT = '/opt/projects/stroke-board/openspec';

/**
 * `box-shadow` が**外へ**光を漏らしているか。
 *
 * `inset` の影は面の内側で厚みを作るためのもので、際立ちには当たらない。外向きの影が
 * 1枚でもあれば「際立っている」と見なす。影の色や広がりは `ui.md` が持つので、ここでは
 * 有無だけを見る。
 */
function hasOuterGlow(boxShadow: string): boolean {
  if (boxShadow === 'none') return false;

  // 影は `,` 区切りだが色関数の中にも `,` が入るため、括弧の外の `,` だけで割る
  const layers: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of boxShadow) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      layers.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  layers.push(current);

  return layers.some((layer) => !layer.includes('inset'));
}

const UPSTREAM_CSS = join(
  OPENSPEC_ROOT,
  'changes/archive/2026-08-20-steering-dashboard-portal/prototype/assets/spec-workflow.css',
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

  /**
   * かつては行全体に `opacity` を掛けていたが、それでは状態の列まで沈み、押せない理由が
   * 読めなくなる。`specs/project/directory` は「行を弱めるとき状態の列を弱めてはならない」
   * と定め、行全体に一律の弱め方を掛ける実装はこの要件を満たさないとしている。
   *
   * したがって見るのは行の `opacity` ではなく、**弱めた列と弱めていない列の差**である。
   */
  test('未接続の行は、状態以外を弱めて押せないことを示す', async ({ page }) => {
    await page.goto('/projects');

    const row = page.getByTestId('project-row').filter({ hasText: 'idle-project' });

    const cells = await row.evaluate((element) => {
      const tds = [...element.querySelectorAll('td')];
      return tds.map((td) => ({
        // 名前と未処理の通知は子要素を弱める。状態は弱めない
        childOpacity: td.firstElementChild
          ? Number(getComputedStyle(td.firstElementChild).opacity)
          : null,
        color: getComputedStyle(td).color,
      }));
    });

    const [name, state, unread, lastModified] = cells;

    // 押せないことは、名前と未処理の通知を弱めて示す
    expect(name?.childOpacity, '名前は弱める').toBeLessThan(1);
    expect(unread?.childOpacity, '未処理の通知は弱める').toBeLessThan(1);

    // 状態の列は弱めない。押せない理由がここに出ている
    expect(state?.childOpacity, '状態は弱めない').toBe(1);

    // 最終更新は子を持たないので、文字色を地と混ぜて沈める
    const active = page.getByTestId('project-row').filter({ hasText: 'alpha' });
    const activeLastModified = await active.evaluate(
      (element) => getComputedStyle(element.querySelectorAll('td')[3]!).color,
    );
    expect(lastModified?.color, '最終更新は沈める').not.toBe(activeLastModified);
  });

  test('下層の選択中の項目は本家のアクティブ表現になっている', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const style = await page
      .getByTestId('sidebar-overview')
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
  OPENSPEC_ROOT,
  'changes/archive/2026-08-20-steering-dashboard-portal/prototype/navigation.prototype.html',
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
        .locator('svg.iconify--sb path')
        .getAttribute('d');

      expect(d, `${testId} のアイコンが prototype と違う`).toBe(expected[name]);
    }
  });

  test('プロジェクトの行は folder', async ({ page }) => {
    await page.goto('/projects');

    const d = await page
      .getByTestId('project-row')
      .first()
      .locator('svg.iconify--sb path')
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
        .locator('svg.iconify--sb path')
        .getAttribute('d');

      expect(d, `${testId} のアイコンが prototype と違う`).toBe(expected[name]);
    }
  });

  /**
   * 押せるものは押せると見て分かる。
   *
   * 可否判定を撤去して作成が常に押せるようになったとき、`.sb-btn` には `:disabled` の
   * `not-allowed` しか無く、押せる状態のカーソル指定が欠けていた（実測で発覚）。
   * 行（`.sb-row-hit`）は `pointer` を持っており、そちらと扱いが割れていた。
   */
  test('押せるボタンは pointer、押せないボタンは not-allowed', async ({ page }) => {
    await page.goto('/projects');

    const cursorOf = (testId: string) =>
      page.getByTestId(testId).evaluate(el => getComputedStyle(el).cursor);

    expect(await cursorOf('create-project'), '作成は常に押せる（ADR 0010）').toBe('pointer');
    expect(await cursorOf('register-project'), '登録は中身が未決で非活性').toBe('not-allowed');
  });

  test('押せるボタンはキーボードで辿ったときに枠が出る', async ({ page }) => {
    await page.goto('/projects');

    const button = page.getByTestId('create-project');
    await button.focus();

    const outline = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    expect(outline.style, 'focus-visible の輪郭が無い').not.toBe('none');
    expect(parseFloat(outline.width), 'focus-visible の輪郭に幅が無い').toBeGreaterThan(0);
  });

  test('下層の戻る導線は back、プロジェクト名は folder', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const expected = prototypeIconPaths();

    const back = await page
      .getByTestId('back-to-portal')
      .locator('svg.iconify--sb path')
      .getAttribute('d');
    expect(back).toBe(expected.back);

    const folder = await page
      .getByTestId('workspace-project-name')
      .locator('svg.iconify--sb path')
      .getAttribute('d');
    expect(folder).toBe(expected.folder);
  });

  /*
   * サイドバーの幅だけは prototype ではなく本家に合わせている。
   *
   * prototype が決めたのは「下層のナビは左サイドバーにする」という**形**（ui.md Q34/Q35）で、
   * 170px はその模型がたまたま持っていた寸法である。畳む機能は prototype に無く、畳んだ
   * 64px は本家の `lg:w-16` から来ている。開いた幅だけ prototype に残すと、同じ部品の
   * 開閉が別々の出どころになる。開いた幅も本家の `lg:w-64`＝256px に揃える。
   * 実測の根拠は main.css の `.sb-sidebar` にある。
   */
  test('下層のサイドバーは本家と同じ幅', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const width = await page
      .getByTestId('workspace-sidebar')
      .evaluate((element) => getComputedStyle(element).width);

    expect(width).toBe('256px');
  });
});

test.describe('表の中身が prototype と同じ様式になっている', () => {
  /**
   * 見た目の実値は固定しない。色の混ぜ方は `ui.md` と prototype が持っており、詰め直す
   * たびにテストが落ちるのでは、テストが値の写しになってしまう。ここで確かめるのは
   * specs/project/directory が要求する**関係**である——3状態が同じ形と同じ幅で並ぶこと、
   * 際立つのはアクティブだけであること。
   */
  test('プロジェクト一覧: 3状態は同じ形で並び、際立つのはアクティブだけ', async ({ page }) => {
    await page.goto('/projects');

    const read = (name: string) =>
      page
        .getByTestId('project-row')
        .filter({ hasText: name })
        .locator('.sb-chip')
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            fontSize: style.fontSize,
            minWidth: style.minWidth,
            borderWidth: style.borderTopWidth,
            boxShadow: style.boxShadow,
          };
        });

    const active = await read('alpha');
    const idle = await read('idle-project');

    // 同じ形・同じ幅で並ぶ。枠幅が揃っていないと高さがずれる
    expect(active.minWidth).toBe('76px');
    expect(idle.minWidth).toBe(active.minWidth);
    expect(idle.borderWidth).toBe(active.borderWidth);
    expect(active.fontSize).toBe('11px');
    expect(idle.fontSize).toBe(active.fontSize);

    // 際立つのはアクティブだけ。外へ光を漏らすのはアクティブに限る
    expect(active.color).not.toBe(idle.color);
    expect(hasOuterGlow(active.boxShadow), 'アクティブは外へにじむ').toBe(true);
    expect(hasOuterGlow(idle.boxShadow), '未接続は外へにじまない').toBe(false);
  });

  test('プロジェクト一覧: 最終更新は 12px の secondary', async ({ page }) => {
    await page.goto('/projects');

    const row = page.getByTestId('project-row').filter({ hasText: 'alpha' });

    for (const testId of ['project-last-modified']) {
      const style = await row.getByTestId(testId).evaluate((element) => {
        const own = getComputedStyle(element);
        return { fontSize: own.fontSize, color: own.color };
      });

      expect(style.fontSize, `${testId} の文字サイズ`).toBe('12px');
      expect(style.color, `${testId} の色`).toBe('rgb(203, 213, 225)');
    }
  });
});

/**
 * 下層ヘッダーだけは prototype 準拠の例外。prototype は戻る導線 13px / 主題 14px で
 * 差が 1px しか無く、ヘッダーの中で現在地が立たない。ヘッダーを大きく取り、主題を
 * 戻る導線より一段大きくして階層を作る（この change の決定）。
 */
test.describe('下層のヘッダーは階層が読める文字の大小になっている', () => {
  test('戻る導線 16px / プロジェクト名 20px、主題の方が大きい', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const sizes = {
      back: await page
        .getByTestId('back-to-portal')
        .evaluate((element) => getComputedStyle(element).fontSize),
      title: await page
        .getByTestId('workspace-project-name')
        .evaluate((element) => getComputedStyle(element).fontSize),
    };

    expect(sizes.back, '戻る導線の文字サイズ').toBe('16px');
    expect(sizes.title, 'プロジェクト名の文字サイズ').toBe('20px');

    // 差が無いと階層が読めない。この関係が崩れたら値の意図が失われている
    expect(Number.parseFloat(sizes.title)).toBeGreaterThan(Number.parseFloat(sizes.back));
  });

  test('状態チップは prototype のまま 11px', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const chip = await page
      .locator('header.sb-bar .sb-chip')
      .evaluate((element) => getComputedStyle(element).fontSize);

    expect(chip).toBe('11px');
  });

  test('戻る導線はマウスを乗せると塗りが変わる', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const back = page.getByTestId('back-to-portal');

    const idle = await back.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });

    // 乗せる前は塗っていない
    expect(idle.background).toBe('rgba(0, 0, 0, 0)');

    await back.hover();

    const hovered = await back.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });

    /*
     * `.sb-navitem:hover` の面（surface-hover #334155）はヘッダーの面（#1e293b）との差が
     * 小さく、乗せても変わったことに気づけない。アクセントで塗って白に抜く。
     */
    expect(hovered.background).toBe('rgb(99, 102, 241)');
    expect(hovered.color).toBe('rgb(255, 255, 255)');
    expect(hovered.background).not.toBe('rgb(51, 65, 85)');
  });

  test('戻る導線はフォーカスすると枠が出る', async ({ page }) => {
    await page.goto('/projects/ALPHAID000000001');

    const back = page.getByTestId('back-to-portal');

    // 何も当たっていないときは出ない
    const idle = await back.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(idle).toBe('none');

    // キーボードでもマウスでも出す（:focus-visible ではなく :focus）
    await back.focus();

    const focused = await back.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
      };
    });

    expect(focused.outlineStyle).toBe('solid');
    expect(focused.outlineWidth).toBe('3px');
    expect(focused.outlineOffset).toBe('3px');
    // 本家の --border-focus（#818cf8）。色はこの1色だけで、背景や文字色は動かさない
    expect(focused.outlineColor).toBe('rgb(129, 140, 248)');
  });
});
