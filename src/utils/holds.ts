import type { Block, Note } from '@/types/chart'

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
