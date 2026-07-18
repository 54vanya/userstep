import { test, expect, Page } from '@playwright/test'

async function openEmptyChart(page: Page) {
  await page.goto('/')
  await page.click('text=New Chart')
  await page.click('text=Create new')
  await page.waitForTimeout(400)
}

function scroller(page: Page) {
  return page.locator('.overflow-x-auto.bg-grid').first()
}

async function getNotes(page: Page): Promise<{ row: number; col: number; type: string }[]> {
  await page.waitForTimeout(700)
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('piu-session')!).tabs[0].chart.blocks[0].notes)
}

// Минимальный валидный WAV: 8кГц моно 16-бит, secs секунд тишины.
function makeWav(secs: number): Buffer {
  const rate = 8000
  const dataLen = rate * 2 * secs
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  return buf
}

test('Alt+drag рисует серию тапов', async ({ page }) => {
  await openEmptyChart(page)
  const box = (await scroller(page).boundingBox())!
  const x = box.x + 20 // col 0
  const yOf = (line: number) => box.y + 40 + line * 24

  await page.keyboard.down('Alt')
  await page.mouse.move(x, yOf(2))
  await page.mouse.down()
  for (let line = 3; line <= 6; line++) await page.mouse.move(x, yOf(line))
  await page.mouse.up()
  await page.keyboard.up('Alt')

  const notes = (await getNotes(page)).sort((a, b) => a.row - b.row)
  expect(notes.map(n => n.row)).toEqual([2, 3, 4, 5, 6])
  expect(notes.every(n => n.col === 0 && n.type === 'tap')).toBe(true)
})

test('клавиша на паузе ставит и убирает ноту в строке под курсором', async ({ page }) => {
  await openEmptyChart(page)
  await page.keyboard.press('s') // курсор на старте → строка 0, колонка 2
  let notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ row: 0, col: 2, type: 'tap' })

  await page.keyboard.press('s') // повторное нажатие — тогл, ячейка очищается
  notes = await getNotes(page)
  expect(notes).toHaveLength(0)

  // Обе раскладки активны одновременно: цифра 4 (StepMania) → колонка 3.
  await page.keyboard.press('4')
  notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ row: 0, col: 3, type: 'tap' })
})

test('зажатая клавиша + стрелки рисуют холд от якоря', async ({ page }) => {
  await openEmptyChart(page)
  await page.keyboard.down('s')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp') // укоротили обратно
  await page.keyboard.up('s')

  const notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ row: 0, col: 2, type: 'hold', endRow: 2 })

  // Весь жест — один шаг undo (история на паузе во время растягивания).
  await page.keyboard.press('Control+z')
  expect(await getNotes(page)).toHaveLength(0)
})

test('курсор следует за концом холда при растягивании стрелками', async ({ page }) => {
  await openEmptyChart(page)
  await page.keyboard.down('s')
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.up('s')

  // Конец холда (нижний кэп) лежит ровно на линии курсора — обновление чарта
  // внутри keydown не должно «съедать» шаг навигации (см. navDataRef в ChartGrid).
  const gap = await page.evaluate(() => {
    const cursor = document.querySelector('.bg-red-500\\/70')!.getBoundingClientRect()
    const cap = document.querySelector('img[src*="BottomCap"]')!.getBoundingClientRect()
    return Math.abs(cursor.top - (cap.top + cap.height / 2))
  })
  expect(gap).toBeLessThan(2)

  const notes = await getNotes(page)
  expect(notes[0]).toMatchObject({ row: 0, col: 2, type: 'hold', endRow: 8 })
})

test('зажатая клавиша + ArrowUp растягивает холд вверх от якоря', async ({ page }) => {
  await openEmptyChart(page)
  // Спускаем курсор на строку 5 и ставим якорь там.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.down('s')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowDown') // укоротили обратно
  await page.keyboard.up('s')

  const notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  // Голова холда — на подвижном верхнем конце, хвост — на якоре.
  expect(notes[0]).toMatchObject({ row: 3, col: 2, type: 'hold', endRow: 5 })
})

test('live-запись: клавиша S во время playback кладёт tap в колонку 2', async ({ page }) => {
  await openEmptyChart(page)

  const chooser = page.waitForEvent('filechooser')
  await page.click('text=Open Audio')
  await (await chooser).setFiles({ name: 'silence.wav', mimeType: 'audio/wav', buffer: makeWav(3) })

  // Ждём декодирования аудио (кнопка Play станет активной)
  await expect(page.locator('button[title="Play (Space)"]')).toBeEnabled({ timeout: 5000 })

  await page.keyboard.press('Space') // play
  await page.waitForTimeout(700)
  await page.keyboard.press('s') // live-запись → col 2
  await page.waitForTimeout(200)
  await page.keyboard.press('Space') // pause

  const notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0].col).toBe(2)
  expect(notes[0].type).toBe('tap')
  // ~700мс после старта при 120bpm/split4 (125мс/строка) — строка в районе 4–8
  expect(notes[0].row).toBeGreaterThan(2)
  expect(notes[0].row).toBeLessThan(12)
})
