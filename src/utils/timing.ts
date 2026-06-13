import type { Block, BlockOffset } from '@/types/chart'
import type { BlockLayout } from './geometry'
import { blockRowCount } from './geometry'

export function computeBlockOffsets(blocks: Block[]): BlockOffset[] {
  let timeMs = 0
  return blocks.map(b => {
    const startMs = timeMs + b.delay
    const msPerRow = (60000 / b.bpm) / b.split
    const totalRows = blockRowCount(b)
    timeMs = startMs + totalRows * msPerRow
    return { blockId: b.id, startMs, msPerRow }
  })
}

export function msToScrollY(ms: number, offsets: BlockOffset[], layouts: BlockLayout[]): number {
  if (offsets.length === 0) return 0
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (ms >= offsets[i].startMs) {
      if (i >= layouts.length) continue
      // Зажимаем строку концом блока: у Delay следующего блока нет пикселей в layout
      // (BLOCK_DIVIDER_HEIGHT=0), поэтому без клампа позиция «проскакивала» за границу
      // на время задержки, а на старте следующего блока резко возвращалась назад
      // (прыжок нот вниз). С клампом конвейер просто ПАУЗИТСЯ на границе на время Delay.
      const row = Math.min(
        (ms - offsets[i].startMs) / offsets[i].msPerRow,
        layouts[i].totalRows,
      )
      return layouts[i].startY + row * layouts[i].rh
    }
  }
  return 0
}

export function scrollYToMs(scrollY: number, offsets: BlockOffset[], layouts: BlockLayout[]): number {
  if (layouts.length === 0) return 0
  for (let i = layouts.length - 1; i >= 0; i--) {
    if (scrollY >= layouts[i].startY) {
      const row = (scrollY - layouts[i].startY) / layouts[i].rh
      return offsets[i].startMs + row * offsets[i].msPerRow
    }
  }
  return 0
}
