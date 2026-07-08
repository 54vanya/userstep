// Генерация нормализованных СЕРЫХ спрайтов для ритм-окраски (скин basic):
// тела и кэпы холдов в public/skin/basic/rhythm/ — по аналогии с уже лежащими
// там серыми тапами. Формула: пиксель с яркостью (Rec.709) базового цвета
// направления → серый 120, белый → 255, чёрный → 0, между ними — кусочно-линейно.
// Перед генерацией — самопроверка: формула прогоняется по тапам и сравнивается
// с эталонными rhythm/<dir>-Tap-Note.png (ожидается avg < 2).
//
// Запуск: pnpm dev (на :5173) и `node scripts/gen-rhythm-sprites.mjs [port]` —
// канвас требует same-origin, поэтому картинки читаются через dev-сервер.
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from '@playwright/test'

const port = process.argv[2] ?? '5173'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/skin/basic/rhythm')
const DIRS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']
// Базовые цвета «тела» спрайта по направлениям (как у тапов).
const BASE = {
  DownLeft: [0, 110, 255], DownRight: [0, 110, 255],
  UpLeft: [255, 22, 145], UpRight: [255, 22, 145],
  Center: [255, 170, 0],
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/`)

const result = await page.evaluate(async ({ DIRS, BASE }) => {
  const load = (src) => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(src)); img.src = src
  })
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const toGray = (img, base) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const im = ctx.getImageData(0, 0, c.width, c.height)
    const Lb = luma(...base)
    for (let i = 0; i < im.data.length; i += 4) {
      const L = luma(im.data[i], im.data[i + 1], im.data[i + 2])
      const v = L <= Lb ? (120 * L) / Lb : 120 + (135 * (L - Lb)) / (255 - Lb)
      const g = Math.round(v)
      im.data[i] = im.data[i + 1] = im.data[i + 2] = g
    }
    ctx.putImageData(im, 0, 0)
    return c
  }
  const diffVs = (canvas, refImg) => {
    const c2 = document.createElement('canvas'); c2.width = refImg.width; c2.height = refImg.height
    const ctx2 = c2.getContext('2d'); ctx2.drawImage(refImg, 0, 0)
    const a = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    const b = ctx2.getImageData(0, 0, c2.width, c2.height).data
    let maxD = 0, sum = 0, n = 0
    for (let i = 0; i < a.length; i += 4) {
      if (b[i + 3] < 200 || a[i + 3] < 200) continue
      const d = Math.abs(a[i] - b[i])
      maxD = Math.max(maxD, d); sum += d; n++
    }
    return { maxD, avgD: sum / n }
  }

  const out = { check: {}, files: {} }
  for (const d of DIRS) {
    const tap = await load(`/skin/basic/${d}-Tap-Note.png`)
    const ref = await load(`/skin/basic/rhythm/${d}-Tap-Note.png`)
    out.check[d] = diffVs(toGray(tap, BASE[d]), ref)
    for (const part of ['Hold-Body', 'Hold-BottomCap']) {
      const img = await load(`/skin/basic/${d}-${part}.png`)
      out.files[`${d}-${part}.png`] = toGray(img, BASE[d]).toDataURL('image/png')
    }
  }
  return out
}, { DIRS, BASE })

console.log('Самопроверка формулы на тапах (расхождение с эталонными серыми):')
for (const [d, { maxD, avgD }] of Object.entries(result.check)) {
  console.log(`  ${d}: max=${maxD} avg=${avgD.toFixed(2)}`)
  if (avgD > 2) throw new Error(`формула разошлась с эталоном на ${d}`)
}
for (const [name, dataUrl] of Object.entries(result.files)) {
  writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('written', name)
}
await browser.close()
