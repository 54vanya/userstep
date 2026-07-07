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

// Клик по сетке: col — колонка (0-based), line — номер линии в первом блоке
// (дефолтный блок: 120bpm beat=4 split=4 scale=3 → rowHeight 24px, cursorY 40).
async function clickGridLine(page: Page, col: number, line: number, modifiers: ('Shift' | 'Alt')[] = []) {
  const box = (await scroller(page).boundingBox())!
  await page.mouse.move(box.x + col * 40 + 20, box.y + 40 + line * 24)
  if (modifiers.length) await Promise.all(modifiers.map(m => page.keyboard.down(m)))
  await page.mouse.down()
  await page.mouse.up()
  if (modifiers.length) await Promise.all(modifiers.map(m => page.keyboard.up(m)))
  await page.waitForTimeout(150)
}

async function noteTotal(page: Page): Promise<number> {
  const text = await page.locator('span[title="Notes passed / total"]').textContent()
  return parseInt(text!.split('/')[1].trim(), 10)
}

// ── Undo / redo ──────────────────────────────────────────────────────────────

test('Ctrl+Z undoes and Ctrl+Y redoes a placed note', async ({ page }) => {
  await openEmptyChart(page)
  expect(await noteTotal(page)).toBe(0)

  await clickGridLine(page, 0, 2)
  expect(await noteTotal(page)).toBe(1)

  await page.keyboard.press('Control+z')
  await page.waitForTimeout(150)
  expect(await noteTotal(page)).toBe(0)

  await page.keyboard.press('Control+y')
  await page.waitForTimeout(150)
  expect(await noteTotal(page)).toBe(1)
})

// ── Keyboard navigation ──────────────────────────────────────────────────────

test('End/Home/arrows navigate the chart', async ({ page }) => {
  await openEmptyChart(page)
  const el = scroller(page)

  await page.keyboard.press('End')
  await page.waitForTimeout(100)
  const atEnd = await el.evaluate(e => e.scrollTop)
  expect(atEnd).toBeGreaterThan(0)

  await page.keyboard.press('Home')
  await page.waitForTimeout(100)
  expect(await el.evaluate(e => e.scrollTop)).toBe(0)

  // Одна строка дефолтного блока = 24px (32*3/4)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(100)
  expect(await el.evaluate(e => e.scrollTop)).toBe(24)

  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(100)
  expect(await el.evaluate(e => e.scrollTop)).toBe(0)
})

// ── Tabs ─────────────────────────────────────────────────────────────────────

test('Ctrl+N opens a new tab, Ctrl+W closes it', async ({ page }) => {
  await openEmptyChart(page)
  const tabs = page.locator('.max-w-40') // TabItem buttons
  expect(await tabs.count()).toBe(1)

  await page.keyboard.press('Control+n')
  await page.waitForTimeout(150)
  expect(await tabs.count()).toBe(2)

  await page.keyboard.press('Control+w')
  await page.waitForTimeout(150)
  expect(await tabs.count()).toBe(1)
})

// ── Selection ────────────────────────────────────────────────────────────────

test('Shift+click selects a row range, Esc clears', async ({ page }) => {
  await openEmptyChart(page)
  const overlay = page.getByTestId('selection-overlay')

  await clickGridLine(page, 1, 2, ['Shift'])
  await expect(overlay).toBeVisible()

  // Расширение диапазона вторым Shift+кликом ниже
  await clickGridLine(page, 1, 6, ['Shift'])
  const h = (await overlay.boundingBox())!.height
  expect(h).toBeGreaterThan(4 * 24 - 1) // 4 строки диапазона

  await page.keyboard.press('Escape')
  await expect(overlay).not.toBeVisible()
})

test('plain click clears selection and places a note', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 1, 2, ['Shift'])
  await expect(page.getByTestId('selection-overlay')).toBeVisible()

  await clickGridLine(page, 0, 4)
  await expect(page.getByTestId('selection-overlay')).not.toBeVisible()
  expect(await noteTotal(page)).toBe(1)
})

test('Ctrl+A selects the whole current block', async ({ page }) => {
  await openEmptyChart(page)
  await page.keyboard.press('Control+a')
  const overlay = page.getByTestId('selection-overlay')
  await expect(overlay).toBeVisible()
  // Дефолтный блок: 64 строки × 24px = 1536px
  const h = (await overlay.boundingBox())!.height
  expect(h).toBeGreaterThan(1000)
})

test('Shift+click on rail selects the block', async ({ page }) => {
  await openEmptyChart(page)
  const rail = page.getByTestId('block-rail')
  await rail.getByText('#1').click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-overlay')).toBeVisible()
})

// ── Selection operations (phase 3) ───────────────────────────────────────────

// Ноты первого блока из сохранённой сессии (дебаунс записи 500мс)
async function getNotes(page: Page): Promise<{ row: number; col: number; type: string; endRow?: number }[]> {
  await page.waitForTimeout(700)
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('piu-session')!).tabs[0].chart.blocks[0].notes)
}

test('Delete removes notes in the selected range', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 0, 2)
  await clickGridLine(page, 2, 4)
  expect(await noteTotal(page)).toBe(2)

  await clickGridLine(page, 1, 2, ['Shift']) // выделить строку 2
  await page.keyboard.press('Delete')
  await page.waitForTimeout(150)
  expect(await noteTotal(page)).toBe(1)
  await expect(page.getByTestId('selection-overlay')).not.toBeVisible()
})

test('Ctrl+C / Ctrl+V copies selection and pastes at playhead row', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 0, 2)
  await clickGridLine(page, 1, 2, ['Shift'])
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Escape')

  // Плейхед на строку 4 (скролл стрелками синхронизирует currentTime)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Control+v')

  const notes = (await getNotes(page)).sort((a, b) => a.row - b.row)
  expect(notes).toHaveLength(2)
  expect(notes[0]).toMatchObject({ row: 2, col: 0 })
  expect(notes[1]).toMatchObject({ row: 4, col: 0 })
})

test('X flips selection horizontally', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 0, 2)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('x')

  const notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ row: 2, col: 4 })
})

test('Ctrl+X cuts selection', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 2, 3)
  await clickGridLine(page, 1, 3, ['Shift'])
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(150)
  expect(await noteTotal(page)).toBe(0)

  await page.keyboard.press('Control+v') // вставка обратно на строку 0 плейхеда... из выреза строки 3
  const notes = await getNotes(page)
  expect(notes).toHaveLength(1)
  expect(notes[0]).toMatchObject({ col: 2, row: 0 })
})
