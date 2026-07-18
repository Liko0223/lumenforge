// 验证示例图库：点击「山峦」→ 自动打印 → 截图
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1680,1000'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto('http://localhost:3000/?skipboot', { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 2000))

const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.title === '山峦')
  if (b) { b.click(); return true }
  return false
})
console.log('sample clicked:', clicked)
await new Promise((r) => setTimeout(r, 1500))
const loaded = await page.evaluate(() => document.body.innerText.includes('sample-mountains'))
console.log('sample loaded:', loaded)

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始打印'))
  if (b && !b.disabled) b.click()
})
await new Promise((r) => setTimeout(r, 9000))
await page.screenshot({ path: '/tmp/lf-sample-printing.png' })

let done = false
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  done = await page.evaluate(() => document.body.innerText.includes('打印完成'))
  if (done) break
}
console.log('done:', done)
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: '/tmp/lf-sample-done.png' })
await browser.close()
console.log('OK')
