import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const errors = []
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const shot = (n) => page.screenshot({ path: `${out}/flow-${n}.png` })

// 1. 画面1 で答える → 把握完了 → 画面2
await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.getByText('2回', { exact: true }).click()
await page.getByRole('button', { name: '送信' }).click()
await page.waitForURL('**/proposal?fresh=1', { timeout: 5000 })
await page.waitForTimeout(500)
await shot('1-proposal-fresh')

// 2. 本文にコメント
await page.evaluate(() => {
  const pre = document.querySelector('pre')
  const node = [...pre.childNodes].find((n) => (n.textContent || '').includes('冷蔵庫'))
  const target = node.firstChild ?? node
  const i = target.textContent.indexOf('冷蔵庫')
  const range = document.createRange()
  range.setStart(target, i)
  range.setEnd(target, i + 24)
  const sel = window.getSelection()
  sel.removeAllRanges(); sel.addRange(range)
  pre.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
await page.waitForTimeout(300)
await page.locator('textarea').last().fill('「二重に買う」より「何があるか分からない」が主題では？')
await page.getByRole('button', { name: '付ける' }).click()
await page.waitForTimeout(300)

// 3. 差し戻す → モーダルが開く（1問目）
await page.getByRole('button', { name: /差し戻す/ }).click()
await page.waitForTimeout(500)
await shot('2-ask-q1')

// 4. 1問1答を繰り返す。何問来るかは分からないので、閉じるまで回す
let rounds = 0
while (await page.getByRole('button', { name: '答える' }).isVisible().catch(() => false)) {
  await page.locator('button:has-text("推奨")').first().click().catch(async () => {
    await page.locator('[role="dialog"] button').nth(1).click()
  })
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: '答える' }).click()
  rounds += 1
  await page.waitForTimeout(1100)
  if (rounds === 1) await shot('3-ask-q2')
  if (rounds > 8) break
}
await page.waitForTimeout(500)
await shot('4-revised')

console.log(`answered rounds: ${rounds}`)
console.log(`banner gone: ${!(await page.getByText('AI から質問があります').isVisible().catch(() => false))}`)
console.log(errors.length ? errors.join('\n---\n') : 'flow ok, no errors')
await browser.close()
