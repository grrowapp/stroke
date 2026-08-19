import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto('http://127.0.0.1:3001/?variant=A', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Q3' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/crumb-open.png`, fullPage: true })
await browser.close()
console.log('ok')
