import { chromium } from 'playwright-core'

const out = process.argv[2]
const base = 'http://127.0.0.1:3001'
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

for (const [path, tag] of [['/', 'stroke'], ['/proposal', 'proposal']]) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${tag}.png`, fullPage: true })
}

console.log(errors.length ? errors.join('\n---\n') : 'no console/page errors')
await browser.close()
