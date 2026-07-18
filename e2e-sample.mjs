// 验证旋转成型：点击「祈年殿」→ 切换「旋转」模式 → 打印 → 完成后两个角度截图
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

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.title === '祈年殿')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 1200))
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '旋转')
  if (b) b.click()
})
await new Promise((r) => setTimeout(r, 400))
await page.screenshot({ path: '/tmp/lf-lathe-00-panel.png' })

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始打印'))
  if (b && !b.disabled) b.click()
})
await new Promise((r) => setTimeout(r, 12000))
await page.screenshot({ path: '/tmp/lf-lathe-01-printing.png' })

let done = false
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  done = await page.evaluate(() => document.body.innerText.includes('打印完成'))
  if (done) break
}
console.log('done:', done)
await new Promise((r) => setTimeout(r, 2000))
await page.screenshot({ path: '/tmp/lf-lathe-02-done-a.png' })
await new Promise((r) => setTimeout(r, 5000))
await page.screenshot({ path: '/tmp/lf-lathe-03-done-b.png' })
await browser.close()
console.log('OK')
