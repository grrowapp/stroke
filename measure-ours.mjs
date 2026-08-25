import { chromium } from '@playwright/test';

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  const out = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const pick = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        tag: el.tagName,
        cls: el.className,
        style: el.getAttribute('style'),
        attrs: [...el.attributes].map((a) => a.name),
        display: s.display,
        fontSize: s.fontSize,
        fontFamily: s.fontFamily,
        lineHeight: s.lineHeight,
        bg: s.backgroundColor,
        color: s.color,
        radius: s.borderTopLeftRadius,
        border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
        margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
        padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
        overflow: `${s.overflowX}/${s.overflowY}`,
        whiteSpace: s.whiteSpace,
        ...box(el),
      };
    };
    const root = document.querySelector('[data-testid="document-content"]') || document.body;
    const pres = [...root.querySelectorAll('pre')];
    const codeBlocks = [...root.querySelectorAll('[data-testid="code-block"]')];
    const first = pres[0];
    return {
      preCount: pres.length,
      codeBlockCount: codeBlocks.length,
      mermaidCount: root.querySelectorAll('[data-testid="mermaid-diagram"]').length,
      mermaidSvg: root.querySelectorAll('[data-testid="mermaid-diagram"] svg').length,
      outer: first ? first.parentElement.outerHTML.slice(0, 700) : null,
      inner: first ? first.innerHTML.slice(0, 400) : null,
      pre: pick(first),
      code: pick(first?.querySelector('code')),
      line: pick(first?.querySelector('.line')),
      lineBefore: first
        ? (() => {
            const l = first.querySelector('.line');
            if (!l) return null;
            const s = getComputedStyle(l, '::before');
            return {
              content: s.content,
              position: s.position,
              left: s.left,
              width: s.width,
              padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
              fontSize: s.fontSize,
              color: s.color,
              textAlign: s.textAlign,
            };
          })()
        : null,
      lineCount: first ? first.querySelectorAll('.line').length : 0,
      wrapper: codeBlocks[0] ? pick(codeBlocks[0]) : null,
      label: (() => {
        const l = root.querySelector('[data-testid="code-block-language"]');
        return l ? { text: l.textContent, ...pick(l) } : null;
      })(),
      lines: first
        ? [...first.querySelectorAll('.line')].slice(0, 8).map((e) => ({ t: e.textContent.slice(0, 30), ...box(e) }))
        : null,
    };
  });

  console.log(JSON.stringify(out, null, 2));
} finally {
  await page.close();
  await browser.close();
}
