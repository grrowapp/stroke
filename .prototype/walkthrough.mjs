// 本体の通し確認。概要 → ストローク → proposal → 差し戻し まで、実際のブラウザで踏む。
import { chromium } from 'playwright-core'

const out = process.argv[2]
const browser = await chromium.launch({
  executablePath: '/home/vagrant/.cache/ms-playwright/chromium-1219/chrome-linux64/chrome',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

const shot = (n) => page.screenshot({ path: `${out}/app-${n}.png`, fullPage: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' })
await shot('0-overview')
log('概要画面 OK')

await page.locator('textarea').first().fill(
  '1行のテキストを受け取って、その文字数を数えて返すだけの CLI が欲しい。',
)
await page.getByRole('button', { name: /始める|投稿|送信/ }).first().click()

// セッションが立って最初の問いが出るまで待つ（claude -p の応答待ち）
await page.waitForURL(/\/s\/[0-9a-f-]{36}$/, { timeout: 300000 })
await page.waitForSelector('text=ストローク', { timeout: 300000 })
await page.waitForTimeout(1500)
await shot('1-first-question')
log('最初の問い OK', page.url())

// 推奨の選択肢を選んで送信、を繰り返す。proposal に着いたら抜ける
for (let i = 0; i < 15; i += 1) {
  if (page.url().includes('/proposal')) break
  const recommended = page.locator('button:has-text("推奨")').first()
  if (await recommended.isVisible().catch(() => false)) {
    await recommended.click()
  } else {
    await page.locator('main button, form button').first().click().catch(() => {})
  }
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '送信' }).click()
  await page.waitForTimeout(2000)
  await page.waitForFunction(
    () => !document.body.innerText.includes('AI が次を考えています'),
    { timeout: 300000 },
  )
  await page.waitForTimeout(800)
  log(`ストローク ${i + 1} 完了 → ${page.url()}`)
}

await shot('2-after-strokes')
if (page.url().includes('/proposal')) log('proposal に到達')
else log('15往復しても proposal に届かず（把握完了せず）')

console.log(errors.length ? `ERRORS:\n${errors.join('\n---\n')}` : 'no console/page errors')
await browser.close()
