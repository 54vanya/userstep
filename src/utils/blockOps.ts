// Операции над блоками (StepEdit Lite: Split Here / Merge Blocks / Delete Below).
// Чистые функции над Chart: возвращают новый Chart или null, если операция
// неприменима. Обёртки с updateChart — в hooks/useChart.ts.
import { v4 as uuidv4 } from 'uuid'
import type { Block, Chart, Note } from '@/types/chart'
import { blockRowCount } from './geometry'
import { sanitizeHoldFlags } from './holds'

function noteEnd(n: Note): number {
  return n.type === 'hold' ? (n.endRow ?? n.row) : n.row
}

// Разрез блока на два по строке row (row уходит во второй блок). Холды через
// разрез становятся кросс-блочной цепочкой (continues/continued) — та же
// механика, что у рисования холда через границу в useEditor.
export function splitBlockAt(chart: Chart, blockId: string, row: number): Chart | null {
  const idx = chart.blocks.findIndex(b => b.id === blockId)
  const b = chart.blocks[idx]
  if (!b) return null
  const total = blockRowCount(b)
  if (row <= 0 || row >= total) return null
  const cells = Math.max(1, b.beat * b.split)

  const notesA: Note[] = []
  const notesB: Note[] = []
  for (const n of b.notes) {
    const end = noteEnd(n)
    if (end < row) {
      notesA.push({ ...n })
    } else if (n.row >= row) {
      const nn: Note = { ...n, row: n.row - row }
      if (n.type === 'hold') nn.endRow = end - row
      notesB.push(nn)
    } else {
      // Холд через разрез: continued исходной головы и continues исходного
      // хвоста сохраняются — цепочка может тянуться и дальше.
      notesA.push({ ...n, endRow: row - 1, continues: true })
      notesB.push({ ...n, row: 0, endRow: end - row, continued: true })
    }
  }

  const blockA: Block = { ...b, rowCount: row, measures: row / cells, notes: notesA }
  const blockB: Block = {
    ...b,
    id: uuidv4(),
    delay: 0,
    rowCount: total - row,
    measures: (total - row) / cells,
    notes: notesB,
  }
  const blocks = [...chart.blocks.slice(0, idx), blockA, blockB, ...chart.blocks.slice(idx + 1)]
  return { ...chart, blocks }
}

// Слияние со следующим блоком: свойства (bpm/beat/split/delay) — от первого.
// Строки второго пересчитываются под split первого (round — ноты остаются на
// своих долях), парные цепочки continues+continued склеиваются в один холд.
export function mergeWithNext(chart: Chart, blockId: string): Chart | null {
  const idx = chart.blocks.findIndex(b => b.id === blockId)
  const a = chart.blocks[idx]
  const b = chart.blocks[idx + 1]
  if (!a || !b) return null
  const rowsA = blockRowCount(a)
  const factor = a.split / b.split
  const conv = (r: number) => rowsA + Math.round(r * factor)
  const total = rowsA + Math.round(blockRowCount(b) * factor)
  const clamp = (r: number) => Math.min(total - 1, r)

  const bContinued = new Map<number, Note>()
  for (const n of b.notes) {
    if (n.type === 'hold' && n.continued) bContinued.set(n.col, n)
  }
  const consumed = new Set<Note>()
  const merged: Note[] = []
  for (const n of a.notes) {
    if (n.type === 'hold' && n.continues) {
      const partner = bContinued.get(n.col)
      if (partner) {
        consumed.add(partner)
        const nn: Note = { ...n, endRow: clamp(conv(noteEnd(partner))) }
        if (partner.continues) nn.continues = true
        else delete nn.continues
        merged.push(nn)
        continue
      }
    }
    merged.push({ ...n })
  }
  for (const n of b.notes) {
    if (consumed.has(n)) continue
    const nn: Note = { ...n, row: clamp(conv(n.row)) }
    if (n.type === 'hold') nn.endRow = clamp(conv(noteEnd(n)))
    merged.push(nn)
  }

  const cells = Math.max(1, a.beat * a.split)
  const mergedBlock: Block = { ...a, rowCount: total, measures: total / cells, notes: merged }
  const blocks = sanitizeHoldFlags([
    ...chart.blocks.slice(0, idx),
    mergedBlock,
    ...chart.blocks.slice(idx + 2),
  ])
  return { ...chart, blocks }
}

// Усечение блока: остаются строки 0..row-1, всё ниже удаляется. Холды через
// срез обрезаются (выродившиеся — в tap), зависшие цепочки соседа чистятся.
export function deleteBelow(chart: Chart, blockId: string, row: number): Chart | null {
  const idx = chart.blocks.findIndex(b => b.id === blockId)
  const b = chart.blocks[idx]
  if (!b) return null
  const total = blockRowCount(b)
  if (row < 1 || row >= total) return null
  const cells = Math.max(1, b.beat * b.split)

  const notes: Note[] = []
  for (const n of b.notes) {
    if (n.row >= row) continue
    if (n.type !== 'hold' || noteEnd(n) < row) {
      notes.push({ ...n })
      continue
    }
    if (n.row === row - 1) {
      notes.push({ row: n.row, col: n.col, type: 'tap' })
    } else {
      const nn: Note = { ...n, endRow: row - 1 }
      delete nn.continues
      notes.push(nn)
    }
  }

  const blocks = sanitizeHoldFlags(chart.blocks.map((blk, i) =>
    i === idx ? { ...blk, rowCount: row, measures: row / cells, notes } : blk))
  return { ...chart, blocks }
}
