// 画面2 の通し: コメント → 差し戻し → （問い返しがあれば1問1答）→ 承認。
import { chromium } from 'playwright-core'

const out = process.argv[2]
const sessionId = process.argv[3]
const base = `http://127.0.0.1:3001/s/${sessionId}/proposal`

const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const shot = (n) => page.screenshot({ path: `${out}/p-${n}.png` })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const gone = (text) => page.waitForFunction(
  (t) => !document.body.innerText.includes(t), text, { timeout: 300000 },
)

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await shot('0-proposal')
log('画面2 表示')

// コメント0件で差し戻す → 警告が出て止まること
await page.getByRole('button', { name: /差し戻す/ }).click()
await page.waitForTimeout(600)
const blocked = await page.getByText('差し戻せません').isVisible().catch(() => false)
log(`コメント0件の差し戻し: ${blocked ? '止まった' : '止まらなかった（不正）'}`)
await shot('1-blocked')
if (blocked) await page.getByRole('button', { name: '分かった' }).click()
await page.waitForTimeout(400)

// 注釈ビューで本文を選んでコメントを付ける
await page.getByRole('button', { name: '注釈' }).click()
await page.waitForTimeout(600)
await page.evaluate(() => {
  const pre = document.querySelector('pre')
  const walk = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT)
  let node = walk.nextNode()
  while (node && node.textContent.trim().length < 30) node = walk.nextNode()
  const range = document.createRange()
  range.setStart(node, 0)
  range.setEnd(node, Math.min(28, node.textContent.length))
  const sel = window.getSelection()
  sel.removeAllRanges(); sel.addRange(range)
  pre.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
})
await page.waitForTimeout(600)
await shot('2-comment-modal')
await page.locator('textarea').last().fill('ここの狙いが読み取れない。もう少し具体的に。')
await page.getByRole('button', { name: '付ける' }).click()
await page.waitForTimeout(600)
await shot('3-commented')
log('コメント1件')

// 差し戻す
await page.getByRole('button', { name: /差し戻す/ }).click()
await gone('AI が次を考えています')
await page.waitForTimeout(1500)
await shot('4-after-sendback')

// 問い返しがあれば、尽きるまで1問1答
const dialog = page.locator('[role="dialog"]').first()
const answerBtn = page.getByRole('button', { name: '答える' })
const banner = page.getByText('AI から質問があります')

for (let i = 0; i < 10; i += 1) {
  if (!(await dialog.isVisible().catch(() => false))) {
    if (!(await banner.isVisible().catch(() => false))) break
    await banner.click()
    await page.waitForTimeout(600)
  }
  // 「答える」が出るまで待つ（待機表示が消えた合図）
  await answerBtn.waitFor({ state: 'visible', timeout: 300000 }).catch(() => {})
  if (!(await answerBtn.isVisible().catch(() => false))) break
  if (i === 0) await shot('5-followup')

  const rec = dialog.locator('button:has-text("推奨")').first()
  if (await rec.isVisible().catch(() => false)) await rec.click()
  else await dialog.locator('button').nth(2).click()
  await page.waitForTimeout(300)
  await answerBtn.click()
  // 応答待ち。答えるボタンが消えている間は待つ
  await page.waitForFunction(
    () => !document.body.innerText.includes('AI が次を考えています'),
    undefined,
    { timeout: 300000 },
  )
  await page.waitForTimeout(2500)
  log(`問い返し ${i + 1} に回答 (dialog=${await dialog.isVisible().catch(() => false)})`)
}
await shot('6-revised')
log('差し戻し完了')

// 承認
await page.getByRole('button', { name: '承認して作る' }).click()
await page.waitForTimeout(800)
await shot('7-approve-modal')
await page.getByRole('button', { name: '作る' }).click()
await page.waitForTimeout(3000)
await shot('8-approved')
log('承認完了')

console.log(errors.length ? `ERRORS:\n${errors.join('\n---\n')}` : 'no console/page errors')
await browser.close()
