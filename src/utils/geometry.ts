import type { Block } from '@/types/chart'

export const COLUMN_WIDTH = 40
export const BASE_BEAT_HEIGHT = 32
export const BLOCK_DIVIDER_HEIGHT = 0
export const CURSOR_LINE_Y = 40
export const LABEL_WIDTH = 64
export const RAIL_WIDTH = 64

export interface BlockLayout {
  block: Block
  startY: number
  endY: number
  rh: number
  totalRows: number
}

export function rowHeight(scale: number, split: number): number {
  return (BASE_BEAT_HEIGHT * scale) / split
}

export function blockRowCount(block: Block): number {
  return block.rowCount ?? Math.round(block.beat * block.split * block.measures)
}

export function blockPixelHeight(block: Block, scale: number): number {
  return blockRowCount(block) * rowHeight(scale, block.split)
}

export function pixelToRow(py: number, scale: number, split: number): number {
  return Math.floor(py / rowHeight(scale, split))
}

export function pixelToCol(px: number): number {
  return Math.floor(px / COLUMN_WIDTH)
}

// Адаптивная полу-высота зоны клика для линий конкретного блока: квадрат cw/2 (cw —
// эффективная ширина колонки = размер ноты, с учётом зума поля), но не больше rh/2 —
// иначе на плотных split квадраты соседних линий перекрывались бы.
export function hitHalf(rh: number, cw: number = COLUMN_WIDTH): number {
  return Math.min(cw / 2, rh / 2)
}

// Ближайшая хит-линия к точке py (в координатах чарта). Хит-позиция ноты — это
// линия chartY = startY + row*rh; зона регистрации — квадрат вокруг неё. Возвращает
// null, если точка дальше hitHalf от любой линии (мёртвая зона) или вне сетки.
export function hitLine(
  py: number,
  layouts: BlockLayout[],
  cw: number = COLUMN_WIDTH,
): { layout: BlockLayout; row: number; lineY: number } | null {
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i]
    if (py < layout.startY || py >= layout.endY) continue

    const f = Math.floor((py - layout.startY) / layout.rh)
    const yLow = layout.startY + f * layout.rh
    const yHigh = yLow + layout.rh

    // Ближе верхняя граница f+1 → если это граница блока (f+1 === totalRows),
    // линия принадлежит row 0 следующего блока (та же chartY, блоки впритык).
    if (py - yLow > yHigh - py && f + 1 >= layout.totalRows) {
      const next = layouts[i + 1]
      if (next && Math.abs(py - next.startY) <= hitHalf(next.rh, cw)) {
        return { layout: next, row: 0, lineY: next.startY }
      }
      return null
    }

    const row = py - yLow <= yHigh - py ? f : f + 1
    const lineY = layout.startY + row * layout.rh
    if (Math.abs(py - lineY) > hitHalf(layout.rh, cw)) return null
    return { layout, row, lineY }
  }
  return null
}

// Привязка к ближайшей линии БЕЗ мёртвой зоны (round + clamp). Для растягивания
// холда: конец всегда садится на ближайшую линию, даже в редких блоках.
export function snapRow(
  py: number,
  layouts: BlockLayout[],
): { layout: BlockLayout; row: number } | null {
  let result: { layout: BlockLayout; row: number } | null = null
  for (const layout of layouts) {
    if (py < layout.startY) break
    const row = Math.min(
      layout.totalRows - 1,
      Math.max(0, Math.round((py - layout.startY) / layout.rh)),
    )
    result = { layout, row }
    if (py < layout.endY) break
  }
  return result
}
