import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const errors = []
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.getByText('2回', { exact: true }).click()
await page.getByRole('button', { name: '送信' }).click()
await page.waitForTimeout(250)
const shown = await page.getByText('AI が次を考えています').isVisible()
await page.screenshot({ path: `${out}/loading-screen1.png` })
await page.waitForURL('**/proposal?fresh=1', { timeout: 5000 })

console.log(`loading shown on screen1: ${shown}`)
console.log(errors.length ? errors.join('\n---\n') : 'ok, no errors')
await browser.close()
