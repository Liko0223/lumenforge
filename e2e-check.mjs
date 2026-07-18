// 端到端验证：打开页面 → 注入测试图 → 开始打印 → 分阶段截图
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// 生成一张测试图片（渐变 + 圆形暗部，适合浮雕）
const testImg = '/tmp/lf-test-image.png'
{
  const { createCanvas } = await import('node:canvas').catch(() => ({}))
  void createCanvas
}
// 无 node-canvas，用 SVG 转 PNG 太麻烦——直接用 SVG 文件上传（浏览器支持 svg 图片）
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
  <rect width="600" height="600" fill="#f2ede2"/>
  <circle cx="300" cy="300" r="200" fill="#1a1a22"/>
  <circle cx="300" cy="300" r="130" fill="#ff5c1f"/>
  <circle cx="300" cy="300" r="60" fill="#101014"/>
  <rect x="60" y="60" width="90" height="90" fill="#24408a"/>
  <rect x="450" y="450" width="90" height="90" fill="#24408a"/>
</svg>`
fs.writeFileSync('/tmp/lf-test-image.svg', svg)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1680,1000', '--hide-scrollbars'],
  defaultViewport: { width: 1680, height: 1000 },
})
const page = await browser.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))

await page.goto('http://localhost:3000/?skipboot', { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: '/tmp/lf-01-idle.png' })
console.log('idle ok')

// 上传图片
const input = await page.$('input[type=file]')
await input.uploadFile('/tmp/lf-test-image.svg')
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: '/tmp/lf-02-loaded.png' })
console.log('loaded ok')

// 点击开始打印
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find((x) => x.textContent.includes('开始打印'))
  if (b && !b.disabled) { b.click(); return true }
  return false
})
console.log('print clicked:', clicked)
await new Promise((r) => setTimeout(r, 2500))
await page.screenshot({ path: '/tmp/lf-03-printing-a.png' })
console.log('printing early ok')

await new Promise((r) => setTimeout(r, 6000))
await page.screenshot({ path: '/tmp/lf-04-printing-b.png' })

// 等打印完成（轮询状态文本）
let done = false
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 1000))
  done = await page.evaluate(() => document.body.innerText.includes('打印完成'))
  if (done) break
}
console.log('done:', done)
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: '/tmp/lf-05-done.png' })

await browser.close()
console.log('ALL OK')
