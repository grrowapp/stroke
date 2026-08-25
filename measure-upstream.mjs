import { chromium } from '@playwright/test';

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const out = await page.evaluate(() => {
    const w = document.querySelector('[class*="codeMirrorWrapper"]');
    if (!w) return { found: false };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const gutters = w.querySelector('.cm-gutters');
    const wrapperBox = w.getBoundingClientRect();
    return {
      found: true,
      guttersHTML: gutters.outerHTML.slice(0, 800),
      guttersChildren: [...gutters.children].map((c) => ({ cls: c.className, ...box(c) })),
      gutterNumbers: [...w.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].map((e) => ({
        text: e.textContent,
        ...box(e),
        h: Math.round(e.getBoundingClientRect().height),
        style: e.getAttribute('style'),
      })),
      lines: [...w.querySelectorAll('.cm-line')].map((e) => ({
        text: e.textContent.slice(0, 40),
        ...box(e),
      })),
      offsets: {
        wrapper: box(w),
        gutters: box(gutters),
        content: box(w.querySelector('.cm-content')),
        toolbar: box(w.children[0]),
        toolbarRelRight: Math.round(wrapperBox.right - w.children[0].getBoundingClientRect().right),
        toolbarRelTop: Math.round(w.children[0].getBoundingClientRect().top - wrapperBox.top),
      },
      toolbarStyle: (() => {
        const s = getComputedStyle(w.children[0]);
        return {
          position: s.position,
          right: s.right,
          top: s.top,
          gap: s.gap,
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          radius: `${s.borderTopLeftRadius} ${s.borderTopRightRadius} ${s.borderBottomRightRadius} ${s.borderBottomLeftRadius}`,
          bg: s.backgroundColor,
          color: s.color,
          fontSize: s.fontSize,
          zIndex: s.zIndex,
        };
      })(),
      selectTrigger: (() => {
        const b = w.querySelector('[role="combobox"]');
        const s = getComputedStyle(b);
        return {
          text: b.textContent,
          disabled: b.disabled,
          bg: s.backgroundColor,
          color: s.color,
          fontSize: s.fontSize,
          radius: s.borderTopLeftRadius,
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
          opacity: s.opacity,
          cursor: s.cursor,
          ...box(b),
        };
      })(),
      rootTokens: (() => {
        const cs = getComputedStyle(document.documentElement);
        return Object.fromEntries(
          ['--text-xxs', '--text-xs', '--font-mono', '--baseBase', '--baseLine', '--radius-medium', '--spacing-1'].map(
            (n) => [n, cs.getPropertyValue(n).trim()],
          ),
        );
      })(),
      htmlClass: document.documentElement.className,
    };
  });

  console.log(JSON.stringify(out, null, 2));
} finally {
  await page.close();
  await browser.close();
}
