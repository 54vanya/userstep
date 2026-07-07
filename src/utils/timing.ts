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

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

// Блок и строка под плейхедом (ближайшая линия к моменту ms). Для Ctrl+A и
// вставки из клипборда: «текущая позиция» без пиксельных layout'ов.
export function blockRowAtMs(blocks: Block[], ms: number): { blockIdx: number; row: number } | null {
  if (blocks.length === 0) return null
  const offsets = computeBlockOffsets(blocks)
  for (let i = 0; i < blocks.length; i++) {
    const rows = blockRowCount(blocks[i])
    const end = offsets[i].startMs + rows * offsets[i].msPerRow
    if (ms < end || i === blocks.length - 1) {
      const row = Math.min(rows - 1, Math.max(0, Math.round((ms - offsets[i].startMs) / offsets[i].msPerRow)))
      return { blockIdx: i, row }
    }
  }
  return null
}

// Индекс последнего элемента с key(el) <= value (массив отсортирован по key).
// msToScrollY зовётся каждый RAF-кадр playback'а — линейный скан по 100+ блокам
// гиммик-чарта съедал бюджет кадра.
function lastAtOrBefore<T>(arr: T[], value: number, key: (el: T) => number): number {
  let lo = 0
  let hi = arr.length - 1
  let res = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (key(arr[mid]) <= value) { res = mid; lo = mid + 1 } else hi = mid - 1
  }
  return res
}

export function msToScrollY(ms: number, offsets: BlockOffset[], layouts: BlockLayout[]): number {
  if (layouts.length === 0) return 0
  const found = lastAtOrBefore(offsets, ms, o => o.startMs)
  if (found < 0) return 0
  const i = Math.min(found, layouts.length - 1)
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

export function scrollYToMs(scrollY: number, offsets: BlockOffset[], layouts: BlockLayout[]): number {
  if (offsets.length === 0) return 0
  const found = lastAtOrBefore(layouts, scrollY, l => l.startY)
  if (found < 0) return 0
  const i = Math.min(found, offsets.length - 1)
  const row = (scrollY - layouts[i].startY) / layouts[i].rh
  return offsets[i].startMs + row * offsets[i].msPerRow
}
