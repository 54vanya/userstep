import type { Block, Note } from '@/types/chart'
import { blockRowCount } from './geometry'

// Позиция строки в чарте: индекс блока + строка внутри него.
export interface BlockPos {
  blockIdx: number
  row: number
}

// Порядок позиций: сначала блок, внутри блока — строка.
export function comparePos(a: BlockPos, b: BlockPos): number {
  return a.blockIdx - b.blockIdx || a.row - b.row
}

// Эффективный конец ноты: для холда — endRow, для tap — её же строка.
export function noteEnd(n: Note): number {
  return n.type === 'hold' ? (n.endRow ?? n.row) : n.row
}

// Убрать все ноты колонки col, пересекающие диапазон строк [from..to].
// Результат ОБЯЗАТЕЛЬНО прогонять через sanitizeHoldFlags на уровне blocks:
// удалённая часть кросс-блочного холда оставляет партнёрам висячие
// continues/continued, и сериализатор выпустит битую цепочку.
export function clearColumnSpan(notes: Note[], col: number, from: number, to: number): Note[] {
  return notes.filter(n => n.col !== col || noteEnd(n) < from || n.row > to)
}

// Поставить холд (tap при нулевой длине) в колонку col от start до end
// (end >= start), расчистив колонку под ним. Расчистку можно продлить до
// clearEnd (>= end) — нужно живому клавиатурному жесту при укорачивании,
// чтобы стереть хвост прежнего, более длинного холда в следующих блоках.
// Кросс-блочный холд — цепочка нот с флагами continues/continued.
// Результат ОБЯЗАТЕЛЬНО прогонять через sanitizeHoldFlags: расчистка могла
// разрезать чужие цепочки.
export function placeHoldSpan(
  blocks: Block[],
  col: number,
  start: BlockPos,
  end: BlockPos,
  clearEnd: BlockPos = end,
): Block[] {
  return blocks.map((b, i) => {
    if (i < start.blockIdx || i > clearEnd.blockIdx) return b
    const totalRows = blockRowCount(b)
    const clearFrom = i === start.blockIdx ? start.row : 0
    const clearTo = i === clearEnd.blockIdx ? clearEnd.row : totalRows - 1
    let notes = clearColumnSpan(b.notes, col, clearFrom, clearTo)
    if (i <= end.blockIdx) {
      const isFirst = i === start.blockIdx
      const isLast = i === end.blockIdx
      let note: Note
      if (isFirst && isLast) {
        note =
          end.row === start.row
            ? { row: start.row, col, type: 'tap' }
            : { row: start.row, col, type: 'hold', endRow: end.row }
      } else if (isFirst) {
        note = { row: start.row, col, type: 'hold', endRow: totalRows - 1, continues: true }
      } else if (isLast) {
        note = { row: 0, col, type: 'hold', endRow: end.row, continued: true }
      } else {
        note = { row: 0, col, type: 'hold', endRow: totalRows - 1, continued: true, continues: true }
      }
      notes = [...notes, note]
    }
    return { ...b, notes }
  })
}

// Все блочные части кросс-блочной холд-цепочки, содержащей (blocks[anyIdx], col).
// Цепочка связана флагами continues (уходит в следующий блок) / continued
// (пришла из предыдущего).
export function collectHoldChain(blocks: Block[], anyIdx: number, col: number): { idx: number; note: Note }[] {
  const anyNote = blocks[anyIdx]?.notes.find(n => n.col === col && n.type === 'hold')
  if (!anyNote) return []

  // Walk backward to find the true chain start
  let startIdx = anyIdx
  if (anyNote.continued) {
    for (let i = anyIdx - 1; i >= 0; i--) {
      const n = blocks[i].notes.find(n => n.col === col && n.type === 'hold' && n.continues)
      if (!n) break
      startIdx = i
      if (!n.continued) break
    }
  }

  // Walk forward collecting each part
  const chain: { idx: number; note: Note }[] = []
  for (let i = startIdx; i < blocks.length; i++) {
    const n = blocks[i].notes.find(n => {
      if (n.col !== col || n.type !== 'hold') return false
      return i === startIdx ? !n.continued : !!n.continued
    })
    if (!n) break
    chain.push({ idx: i, note: n })
    if (!n.continues) break
  }
  return chain
}

// Снять зависшие флаги цепочек: continues без continued-партнёра в следующем
// блоке (и наоборот) — после удаления/разреза/слияния блоков. Реконнект через
// удалённый средний блок (prev.continues + next.continued) остаётся валидным.
export function sanitizeHoldFlags(blocks: Block[]): Block[] {
  return blocks.map((b, i) => {
    let changed = false
    const notes = b.notes.map(n => {
      if (n.type !== 'hold') return n
      let nn = n
      if (nn.continues) {
        const ok = blocks[i + 1]?.notes.some(m => m.type === 'hold' && m.col === n.col && m.continued)
        if (!ok) { nn = { ...nn }; delete nn.continues; changed = true }
      }
      if (nn.continued) {
        const ok = blocks[i - 1]?.notes.some(m => m.type === 'hold' && m.col === n.col && m.continues)
        if (!ok) { nn = nn === n ? { ...nn } : nn; delete nn.continued; changed = true }
      }
      return nn
    })
    return changed ? { ...b, notes } : b
  })
}
