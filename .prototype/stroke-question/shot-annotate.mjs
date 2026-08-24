import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto('http://127.0.0.1:3001/proposal?variant=B', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)

// 本文の一部をドラッグ選択したことにする
await page.evaluate(() => {
  const pre = document.querySelector('pre')
  const node = [...pre.childNodes].find((n) => (n.textContent || '').includes('冷蔵庫'))
  const target = node.firstChild ?? node
  const text = target.textContent
  const i = text.indexOf('冷蔵庫')
  const range = document.createRange()
  range.setStart(target, i)
  range.setEnd(target, i + 24)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  pre.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/annotate-modal.png` })

// コメントを書いて色を変えて保存
await page.locator('textarea').last().fill('ここは「二重に買う」より「何があるか分からない」が主題では？')
await page.locator('button[style*="background-color"]').nth(2).click()
await page.getByRole('button', { name: '付ける' }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/annotate-saved.png` })

console.log(errors.length ? errors.join('\n---\n') : 'no console/page errors')
await browser.close()
