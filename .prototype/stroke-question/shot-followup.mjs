import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const errors = []

async function run(ask, tag) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  page.on('pageerror', (e) => errors.push(`${tag}: ${e}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`) })

  await page.goto(`http://127.0.0.1:3001/proposal?ask=${ask}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  // 本文を選んでコメントを1件付ける
  await page.evaluate(() => {
    const pre = document.querySelector('pre')
    const node = [...pre.childNodes].find((n) => (n.textContent || '').includes('冷蔵庫'))
    const target = node.firstChild ?? node
    const i = target.textContent.indexOf('冷蔵庫')
    const range = document.createRange()
    range.setStart(target, i)
    range.setEnd(target, i + 24)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    pre.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
  await page.waitForTimeout(400)
  await page.locator('textarea').last().fill('「二重に買う」より「何があるか分からない」が主題では？')
  await page.getByRole('button', { name: '付ける' }).click()
  await page.waitForTimeout(400)

  // 差し戻す
  await page.getByRole('button', { name: /差し戻す/ }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${out}/followup-${tag}.png`, fullPage: true })
  await page.close()
}

await run('1', 'ask1')
await run('2', 'ask2')

console.log(errors.length ? errors.join('\n---\n') : 'no console/page errors')
await browser.close()
