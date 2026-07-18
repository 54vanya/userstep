// Генерация «заглушек» тела холда под головой (скин basic):
// <dir>-Hold-HeadStub.png — фрагмент тела в клетке головы, обрезанный по нижнему
// контуру стрелки (для каждого столбца x рельсы начинаются от самой нижней
// непрозрачной точки стрелки), чтобы тело «выходило из хвостика» стрелки, а не
// торчало сбоку/выше него. Плитка тела выровнена по фазе к нижней грани клетки —
// элемент тела ниже головы продолжается без шва. Рядом кладётся серая версия в
// rhythm/ (нормализация как в gen-rhythm-sprites.mjs) для ритм-окраски.
//
// Запуск: pnpm dev (на :5173) и `node scripts/gen-hold-head-stubs.mjs [port]` —
// канвас требует same-origin, поэтому картинки читаются через dev-сервер.
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from '@playwright/test'

const port = process.argv[2] ?? '5173'
const SKIN = join(dirname(fileURLToPath(import.meta.url)), '../public/skin/basic')
const DIRS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']
// Базовые цвета «тела» спрайта по направлениям (как у тапов).
const BASE = {
  DownLeft: [0, 110, 255], DownRight: [0, 110, 255],
  UpLeft: [255, 22, 145], UpRight: [255, 22, 145],
  Center: [255, 170, 0],
}
// Порог «непрозрачности» контура стрелки: мягкие края/свечение не считаются.
const ALPHA = 96

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`http://localhost:${port}/`)

const result = await page.evaluate(async ({ DIRS, BASE, ALPHA }) => {
  const load = (src) => new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(src)); img.src = src
  })
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

  const out = {}
  for (const d of DIRS) {
    const arrow = await load(`/skin/basic/${d}-Tap-Note.png`)
    const body = await load(`/skin/basic/${d}-Hold-Body.png`)
    const S = arrow.width // клетка головы (в приложении растягивается до cw×cw)

    // Плитка тела в масштабе клетки: ширина → S (как backgroundSize `${cw}px auto`),
    // фаза выровнена к нижней грани (граница плитки на y=S).
    const c = document.createElement('canvas'); c.width = S; c.height = S
    const ctx = c.getContext('2d')
    const hs = body.height * (S / body.width)
    for (let y = S; y > -hs; y -= hs) ctx.drawImage(body, 0, y - hs, S, hs)

    // Нижний контур стрелки: для каждого x — самая нижняя непрозрачная точка.
    const ac = document.createElement('canvas'); ac.width = S; ac.height = S
    const actx = ac.getContext('2d'); actx.drawImage(arrow, 0, 0, S, S)
    const a = actx.getImageData(0, 0, S, S).data
    const lowest = new Array(S).fill(-1)
    for (let x = 0; x < S; x++) {
      for (let y = S - 1; y >= 0; y--) {
        if (a[(y * S + x) * 4 + 3] >= ALPHA) { lowest[x] = y; break }
      }
    }

    // Обрезка: выше контура (и там, где стрелки нет вовсе) рельсы стираются.
    const im = ctx.getImageData(0, 0, S, S)
    for (let x = 0; x < S; x++) {
      const cut = lowest[x] // -1 → стереть весь столбец
      for (let y = 0; y < S; y++) {
        if (cut === -1 || y < cut) im.data[(y * S + x) * 4 + 3] = 0
      }
    }
    ctx.putImageData(im, 0, 0)
    out[`${d}-Hold-HeadStub.png`] = c.toDataURL('image/png')

    // Серая версия для ритм-окраски (та же нормализация, что в rhythm/).
    const Lb = luma(...BASE[d])
    for (let i = 0; i < im.data.length; i += 4) {
      const L = luma(im.data[i], im.data[i + 1], im.data[i + 2])
      const v = L <= Lb ? (120 * L) / Lb : 120 + (135 * (L - Lb)) / (255 - Lb)
      const g = Math.round(v)
      im.data[i] = im.data[i + 1] = im.data[i + 2] = g
    }
    ctx.putImageData(im, 0, 0)
    out[`rhythm/${d}-Hold-HeadStub.png`] = c.toDataURL('image/png')

  }
  return out
}, { DIRS, BASE, ALPHA })

for (const [name, dataUrl] of Object.entries(result)) {
  writeFileSync(join(SKIN, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('written', name)
}
await browser.close()
