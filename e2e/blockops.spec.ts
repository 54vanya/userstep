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

async function clickGridLine(page: Page, col: number, line: number) {
  const box = (await scroller(page).boundingBox())!
  await page.mouse.click(box.x + col * 40 + 20, box.y + 40 + line * 24)
  await page.waitForTimeout(150)
}

async function openBlockPopup(page: Page, label = '#1') {
  await page.getByTestId('block-rail').getByText(label).click()
  await expect(page.getByTestId('block-settings-popup')).toBeVisible()
}

async function getBlocks(page: Page): Promise<{ rowCount: number; notes: { row: number; col: number; endRow?: number }[] }[]> {
  await page.waitForTimeout(700) // дебаунс записи сессии 500мс
  return page.evaluate(() => JSON.parse(localStorage.getItem('piu-session')!).tabs[0].chart.blocks)
}

test('Split here разрезает блок по строке плейхеда', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 0, 10) // нота на строке 10
  // Попап открываем до прокрутки: клик по «#1» после прокрутки заставил бы
  // Playwright проскроллить рельсу обратно к началу (scrollIntoView).
  await openBlockPopup(page)
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown') // плейхед на строку 8
  await page.click('text=Split here (row 8)')
  await page.waitForTimeout(150)

  const blocks = await getBlocks(page)
  expect(blocks).toHaveLength(2)
  expect(blocks[0].rowCount).toBe(8)
  expect(blocks[1].rowCount).toBe(56)
  expect(blocks[1].notes[0]).toMatchObject({ row: 2, col: 0 })
})

test('Merge with next сливает блоки обратно', async ({ page }) => {
  await openEmptyChart(page)
  await openBlockPopup(page)
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  await page.click('text=Split here (row 8)')
  await page.waitForTimeout(150)

  await page.click('text=Merge with next')
  await page.waitForTimeout(150)

  const blocks = await getBlocks(page)
  expect(blocks).toHaveLength(1)
  expect(blocks[0].rowCount).toBe(64)
})

test('Delete below усечает блок', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 1, 12)
  await openBlockPopup(page)
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  await page.click('text=Delete below (row 8)')
  await page.waitForTimeout(150)

  const blocks = await getBlocks(page)
  expect(blocks).toHaveLength(1)
  expect(blocks[0].rowCount).toBe(8)
  expect(blocks[0].notes).toHaveLength(0) // нота на строке 12 удалена
})

test('смена Split пересчитывает строки нот (adjust beat-split)', async ({ page }) => {
  await openEmptyChart(page)
  await clickGridLine(page, 0, 2)

  await openBlockPopup(page)
  const popup = page.getByTestId('block-settings-popup')
  await popup.locator('select').nth(1).selectOption('8') // Split 4 → 8
  await page.waitForTimeout(150)

  const blocks = await getBlocks(page)
  expect(blocks[0].rowCount).toBe(128) // строк вдвое больше
  expect(blocks[0].notes[0]).toMatchObject({ row: 4, col: 0 }) // нота на той же доле
})
