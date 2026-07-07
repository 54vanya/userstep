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

async function getBlocks(page: Page): Promise<{ rowCount: number; notes: unknown[] }[]> {
  await page.waitForTimeout(700)
  return page.evaluate(() => JSON.parse(localStorage.getItem('piu-session')!).tabs[0].chart.blocks)
}

test('статус-бар показывает позицию под мышью', async ({ page }) => {
  await openEmptyChart(page)
  const box = (await scroller(page).boundingBox())!
  await page.mouse.move(box.x + 60, box.y + 40 + 6 * 24) // строка 6
  const status = page.getByTestId('status-bar')
  await expect(status).toHaveText(/#1 · row 6\/64 · measure 1 · beat 2/)
  await expect(status).toHaveText(/^0:00\.750/)

  // Уход мыши очищает бар
  await page.mouse.move(box.x + 60, box.y - 30)
  await expect(status).toHaveText('')
})

test('перетаскивание нижней границы блока меняет rowCount', async ({ page }) => {
  await openEmptyChart(page)
  await page.keyboard.press('End') // граница блока — за вьюпортом, скроллим к ней
  await page.waitForTimeout(200)
  const handle = page.getByTestId('block-resize-handle').first()
  const hb = (await handle.boundingBox())!

  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 10 * 24, { steps: 5 }) // вверх на 10 строк
  await page.mouse.up()

  const blocks = await getBlocks(page)
  expect(blocks[0].rowCount).toBe(54) // 64 − 10
})

test('drag&drop .ucs открывает новую вкладку', async ({ page }) => {
  await openEmptyChart(page)
  const ucs = [
    ':Format=1', ':Mode=Single', ':BPM=140', ':Delay=0', ':Beat=4', ':Split=4',
    ...Array.from({ length: 16 }, (_, i) => (i === 2 ? 'X....' : '.....')),
  ].join('\n')

  await page.evaluate(async content => {
    const dt = new DataTransfer()
    dt.items.add(new File([content], 'test.ucs', { type: 'text/plain' }))
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
  }, ucs)
  await page.waitForTimeout(300)

  const tabs = page.locator('.max-w-40')
  expect(await tabs.count()).toBe(2)
  await expect(tabs.nth(1)).toContainText('test')
})

test('модалка шорткатов открывается из File-меню и закрывается по Esc', async ({ page }) => {
  await openEmptyChart(page)
  await page.click('text=File')
  await page.click('text=Keyboard shortcuts…')

  const modal = page.getByTestId('shortcuts-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('Keyboard shortcuts')
  await expect(modal).toContainText('Key note input')

  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()

  // Клик по фону тоже закрывает
  await page.click('text=File')
  await page.click('text=Keyboard shortcuts…')
  await expect(modal).toBeVisible()
  await page.mouse.click(10, 500)
  await expect(modal).not.toBeVisible()
})

test('чекбокс Metronome есть и персистится', async ({ page }) => {
  await openEmptyChart(page)
  const cb = page.locator('label:has-text("Metronome") input')
  await expect(cb).not.toBeChecked()
  await cb.check()
  await page.waitForTimeout(100)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('piu-view-settings')!).metronome)
  expect(stored).toBe(true)
})
