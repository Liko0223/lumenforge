// 验证多视图交汇：点击标准四视图套装 → 原子装载 → 打印 → 截图
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE_URL = process.env.LUMENFORGE_URL ?? 'http://127.0.0.1:3000/?skipboot'
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1680,1000'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 2000))

const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.title.includes('四视图套装'))
  if (b) { b.click(); return true }
  return false
})
console.log('hull sample clicked:', clicked)
if (!clicked) throw new Error('找不到四视图示例入口')
await new Promise((r) => setTimeout(r, 2000))
const loaded = await page.evaluate(() => document.body.innerText.includes('4/4'))
console.log('views loaded:', loaded)
if (!loaded) throw new Error('四视图未完整装载')
await page.screenshot({ path: '/tmp/lf-hull-00-panel.png' })

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('开始打印'))
  if (b && !b.disabled) b.click()
})
await new Promise((r) => setTimeout(r, 10000))
await page.screenshot({ path: '/tmp/lf-hull-01-printing.png' })

let done = false
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  done = await page.evaluate(() => document.body.innerText.includes('打印完成'))
  if (done) break
}
console.log('done:', done)
if (!done) throw new Error('多视图打印未在时限内完成')
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: '/tmp/lf-hull-02-done.png' })
await page.mouse.move(1080, 500)
await page.mouse.down()
await page.mouse.move(760, 500, { steps: 24 })
await page.mouse.up()
await new Promise((r) => setTimeout(r, 1200))
await page.screenshot({ path: '/tmp/lf-hull-03-rotated.png' })
await browser.close()
console.log('OK')
