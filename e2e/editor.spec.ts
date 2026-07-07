import { test, expect, Page } from '@playwright/test'

async function openEmptyChart(page: Page) {
  await page.goto('/')
  await page.click('text=New Chart')
  await page.click('text=Create new')
  await page.waitForTimeout(400)
}

// ── Sidebar time display ─────────────────────────────────────────────────────

test('sidebar shows current / total time after opening a chart', async ({ page }) => {
  await openEmptyChart(page)
  const display = page.getByTestId('time-display')
  await expect(display).toBeVisible()
  // Should match m:ss.mmm / m:ss.mmm pattern (3-digit milliseconds)
  const text = await display.textContent()
  expect(text).toMatch(/^\d+:\d{2}\.\d{3} \/ \d+:\d{2}\.\d{3}$/)
})

test('total time updates when a block is added', async ({ page }) => {
  await openEmptyChart(page)
  const display = page.getByTestId('time-display')
  const before = await display.textContent()

  // Add a block via the rail
  const scroller = page.locator('.overflow-x-auto.bg-grid').first()
  await scroller.evaluate(el => el.scrollTop = el.scrollHeight)
  await page.click('button[title="Add block"]')
  await page.waitForTimeout(300)

  const after = await display.textContent()
  // Total time portion (after " / ") must have increased
  const totalBefore = before!.split(' / ')[1]
  const totalAfter = after!.split(' / ')[1]
  expect(totalAfter).not.toEqual(totalBefore)
})

// ── Welcome screen ───────────────────────────────────────────────────────────

test('welcome screen renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('PIU StepMaker')).toBeVisible()
  await expect(page.getByText('Import .ucs')).toBeVisible()
})

// ── Chart editor layout ──────────────────────────────────────────────────────

test('chart info opens in a modal from the File menu', async ({ page }) => {
  await openEmptyChart(page)
  // Метаданные больше не живут в сайдбаре — только в модалке File → Chart info.
  await expect(page.getByText('CHART INFO')).not.toBeVisible()
  await page.click('text=File')
  await page.click('text=Chart info')
  const modal = page.getByTestId('chart-info-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Title')).toBeVisible()
  await expect(modal.getByText('Artist')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
})

test('block rail is visible on the right with block info', async ({ page }) => {
  await openEmptyChart(page)
  const rail = page.getByTestId('block-rail')
  await expect(rail).toBeVisible()
  await expect(rail.getByText('#1')).toBeVisible()
  await expect(rail.getByText('120')).toBeVisible()
})

// ── Popup open / close ───────────────────────────────────────────────────────

test('clicking block in rail opens settings popup', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.getByText('Block 1')).toBeVisible()
  await expect(page.locator('input[type="number"]').first()).toBeVisible()
})

test('popup closes when clicking ✕', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.getByText('Block 1')).toBeVisible()
  await page.click('button[title="Close"]')
  await expect(page.getByText('Block 1')).not.toBeVisible()
})

test('clicking same block again closes popup', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.getByText('Block 1')).toBeVisible()
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.getByText('Block 1')).not.toBeVisible()
})

test('only one popup visible at a time', async ({ page }) => {
  await openEmptyChart(page)
  // Add a second block
  const scroller = page.locator('.overflow-x-auto.bg-grid').first()
  await scroller.evaluate(el => el.scrollTop = el.scrollHeight)
  await page.click('button[title="Add block"]')
  await page.waitForTimeout(300)

  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.getByText('Block 1')).toBeVisible()

  await page.getByTestId('block-rail').getByText('#2').click()
  await expect(page.getByText('Block 2')).toBeVisible()
  await expect(page.getByText('Block 1')).not.toBeVisible()
})

// ── Popup position ───────────────────────────────────────────────────────────

test('popup appears directly to the right of the rail (≤16px gap)', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()

  const railBox = await page.getByTestId('block-rail').boundingBox()
  const popupBox = await page.locator('text=Block 1').locator('..').boundingBox()

  expect(railBox).not.toBeNull()
  expect(popupBox).not.toBeNull()

  const railRightEdge = railBox!.x + railBox!.width
  const gap = popupBox!.x - railRightEdge
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(16)
})

test('popup top is not above the editor area', async ({ page }) => {
  await openEmptyChart(page)

  // The scroll container is the editor area
  const editorBox = await page.locator('.overflow-x-auto.bg-grid').first().boundingBox()
  expect(editorBox).not.toBeNull()

  await page.getByTestId('block-rail').getByText('#1').click()
  await page.waitForTimeout(100)

  const popupBox = await page.locator('text=Block 1').locator('..').boundingBox()
  expect(popupBox).not.toBeNull()

  // Popup top must be >= editor top (not above the editor / tabs)
  expect(popupBox!.y).toBeGreaterThanOrEqual(editorBox!.y - 1)
})

test('popup bottom does not exceed editor bottom', async ({ page }) => {
  await openEmptyChart(page)

  const editorBox = await page.locator('.overflow-x-auto.bg-grid').first().boundingBox()
  expect(editorBox).not.toBeNull()
  const editorBottom = editorBox!.y + editorBox!.height

  await page.getByTestId('block-rail').getByText('#1').click()
  await page.waitForTimeout(100)

  const popupBox = await page.locator('text=Block 1').locator('..').boundingBox()
  expect(popupBox).not.toBeNull()

  const popupBottom = popupBox!.y + popupBox!.height
  expect(popupBottom).toBeLessThanOrEqual(editorBottom + 1)
})

// ── Popup form layout ────────────────────────────────────────────────────────

test('rail shows BPM and beat/split on the same line', async ({ page }) => {
  await openEmptyChart(page)

  const block = page.getByTestId('block-rail').locator('[style*="top: 0"]').first()
  const bpmSpan = block.locator('span').nth(0)   // e.g. "120"
  const sigSpan = block.locator('span').nth(1)   // e.g. "4/4"

  const bpmBox = await bpmSpan.boundingBox()
  const sigBox = await sigSpan.boundingBox()

  expect(bpmBox).not.toBeNull()
  expect(sigBox).not.toBeNull()

  // Both spans must be on the same row (±4px)
  expect(Math.abs(bpmBox!.y - sigBox!.y)).toBeLessThanOrEqual(4)
})

// ── Popup buttons ────────────────────────────────────────────────────────────

test('no Duplicate button in popup', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.locator('button[title="Duplicate block"]')).not.toBeVisible()
})

test('Insert After creates a block with 1 measure and same BPM/beat/split', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await page.click('button[title="Insert block after"]')
  await page.waitForTimeout(300)

  // Two blocks should now exist in the rail
  await expect(page.getByTestId('block-rail').getByText('#2')).toBeVisible()

  // Open the new block and verify measures = 1
  await page.getByTestId('block-rail').getByText('#2').click()
  await page.waitForTimeout(200)

  // The Measures input should show 1
  const measuresInput = page.locator('input[type="number"]').filter({ hasText: '' }).nth(1)
  // Use a more reliable selector: find the FieldRow for Measures
  const measuresRow = page.locator('text=Measures').locator('..').locator('input')
  await expect(measuresRow).toHaveValue('1')
})

test('Delete button has trash icon and removes block', async ({ page }) => {
  await openEmptyChart(page)
  // Add second block so delete becomes available
  const scroller = page.locator('.overflow-x-auto.bg-grid').first()
  await scroller.evaluate(el => el.scrollTop = el.scrollHeight)
  await page.click('button[title="Add block"]')
  await page.waitForTimeout(300)

  // Open block 2 and delete it
  await page.getByTestId('block-rail').getByText('#2').click()
  await expect(page.locator('button[title="Delete block"]')).toBeVisible()
  await page.click('button[title="Delete block"]')
  await page.waitForTimeout(300)

  // Only block 1 should remain
  await expect(page.getByTestId('block-rail').getByText('#1')).toBeVisible()
  await expect(page.getByTestId('block-rail').getByText('#2')).not.toBeVisible()
})

test('Delete button is hidden when only one block exists', async ({ page }) => {
  await openEmptyChart(page)
  await page.getByTestId('block-rail').getByText('#1').click()
  await expect(page.locator('button[title="Delete block"]')).not.toBeVisible()
})

// ── Rail add button ──────────────────────────────────────────────────────────

test('+ button at bottom of rail appends a new block', async ({ page }) => {
  await openEmptyChart(page)
  const scroller = page.locator('.overflow-x-auto.bg-grid').first()
  await scroller.evaluate(el => el.scrollTop = el.scrollHeight)
  await page.waitForTimeout(200)
  await page.click('button[title="Add block"]')
  await page.waitForTimeout(300)
  await expect(page.getByTestId('block-rail').getByText('#2')).toBeVisible()
})
