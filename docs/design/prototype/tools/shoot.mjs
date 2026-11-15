// Screenshots + audit for the HTML prototypes.
//
//   node shoot.mjs <page.html> <outDir> <shot> [<shot> ...] [--audit] [--full] [--scale=1|2]
//   shot = <hash>@<width>x<height>@<theme>[@<open-popup-id>]   e.g.  chat@1440x900@dark  history@375x812@light
//
// Writes <outDir>/<page>-<hash>-<width>-<theme>[-<popup-id>].png for each shot.
// --audit prints console errors, horizontal overflow and every visible text element whose
// contrast against its composited background is under 4.5:1 (3:1 for large text).
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const candidates = [
  process.env.PLAYWRIGHT_PATH,
  path.join(process.env.HOME, '.npm/_npx/e41f203b7505f1fb/node_modules/playwright'),
  'playwright',
].filter(Boolean)
let chromium
for (const c of candidates) { try { ({ chromium } = require(c)); break } catch {} }
if (!chromium) { console.error('playwright not found; set PLAYWRIGHT_PATH'); process.exit(1) }

const args = process.argv.slice(2)
const audit = args.includes('--audit')
const full = args.includes('--full')
const scale = Number((args.find((a) => a.startsWith('--scale=')) || '--scale=2').split('=')[1])
const [page, outDir, ...shots] = args.filter((a) => !a.startsWith('--'))
fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
const base = path.basename(page, '.html')
let problems = 0

for (const shot of shots) {
  const [hash, size, theme = 'dark', open] = shot.split('@')
  const [w, h] = size.split('x').map(Number)
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: theme === 'light' ? 'light' : 'dark' })
  const p = await ctx.newPage()
  const errors = []
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  p.on('pageerror', (e) => errors.push(String(e)))
  const url = 'file://' + path.resolve(page) + `?theme=${theme}` + (open ? `&open=${open}` : '') + (hash ? `#${hash}` : '')
  await p.goto(url)
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(150)
  const file = path.join(outDir, `${base}-${hash || 'index'}-${w}-${theme}${open ? `-${open}` : ''}.png`)
  await p.screenshot({ path: file, fullPage: full })
  let line = `${file}`
  if (audit) {
    const result = await p.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1
      const cx = cv.getContext('2d', { willReadFrequently: true })
      const rgba = (s) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
      const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat(a) }
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
      function bgOf(el) {
        const layers = []
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const c = rgba(getComputedStyle(n).backgroundColor)
          if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break }
        }
        let acc = rgba(getComputedStyle(document.documentElement).backgroundColor)
        if (acc[3] < 1) acc = over(acc, rgba(getComputedStyle(document.body).backgroundColor))
        if (acc[3] < 1) acc = [255, 255, 255, 1]
        for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc)
        return acc
      }
      const fails = []
      const all = document.querySelectorAll('body *:not(svg):not(svg *):not(script):not(style)')
      for (const el of all) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        if (!own) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden') continue
        if (el.closest('[hidden],[aria-hidden="true"],:disabled,[data-disabled]')) continue
        let op = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) op *= Number(getComputedStyle(n).opacity)
        if (op < 0.95) continue
        const bg = bgOf(el)
        const fg = over(rgba(cs.color), bg)
        const k = ratio(fg, bg)
        const px = parseFloat(cs.fontSize), wt = Number(cs.fontWeight)
        const large = px >= 24 || (px >= 18.66 && wt >= 700)
        if (k < (large ? 3 : 4.5)) fails.push(`${k.toFixed(2)}:1 ${px}px "${el.textContent.trim().slice(0, 40)}" <${el.tagName.toLowerCase()} class="${(el.className.baseVal ?? el.className).slice(0, 60)}">`)
      }
      const overflow = document.documentElement.scrollWidth > innerWidth + 1 ? `horizontal overflow: ${document.documentElement.scrollWidth}px > ${innerWidth}px` : ''
      const small = [...all].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && !el.closest('[hidden]') && parseFloat(getComputedStyle(el).fontSize) < 12).length
      return { fails, overflow, small }
    })
    if (errors.length) { problems++; line += `\n  console errors:\n    ${errors.join('\n    ')}` }
    if (result.overflow) { problems++; line += `\n  ${result.overflow}` }
    if (result.fails.length) { problems++; line += `\n  contrast failures (${result.fails.length}):\n    ${[...new Set(result.fails)].slice(0, 25).join('\n    ')}` }
    line += `\n  text elements under 12px: ${result.small}`
  }
  console.log(line)
  await ctx.close()
}
await browser.close()
if (audit) console.log(problems ? `\n${problems} shot(s) with problems` : '\nall shots clean')
