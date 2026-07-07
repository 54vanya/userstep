import { v4 as uuidv4 } from 'uuid'
import type { Block, Chart, ChartMode, Note } from '@/types/chart'
import { blockCells } from '@/utils/geometry'

interface RawBlock {
  bpm: number
  delay: number
  beat: number
  split: number
  rows: string[]
}

function parseRawBlocks(lines: string[]): { mode: ChartMode; rawBlocks: RawBlock[] } {
  let mode: ChartMode = 'Single'
  const rawBlocks: RawBlock[] = []

  let i = 0

  // Parse header
  while (i < lines.length && !lines[i].startsWith(':BPM=')) {
    const line = lines[i]
    if (line.startsWith(':Mode=')) {
      const val = line.slice(6).trim()
      mode = val === 'Double' ? 'Double' : 'Single'
    }
    i++
  }

  // Parse blocks
  while (i < lines.length) {
    const line = lines[i]

    if (!line.startsWith(':BPM=')) {
      i++
      continue
    }

    let bpm = parseFloat(line.slice(5).trim())
    let delay = 0
    let beat = 4
    let split = 4

    i++
    while (i < lines.length && lines[i].startsWith(':')) {
      const meta = lines[i]
      // Delay бывает дробным (мс с долями) — parseFloat, не parseInt.
      if (meta.startsWith(':Delay=')) delay = parseFloat(meta.slice(7).trim())
      else if (meta.startsWith(':Beat=')) beat = parseInt(meta.slice(6).trim(), 10)
      else if (meta.startsWith(':Split=')) split = parseInt(meta.slice(7).trim(), 10)
      i++
    }

    // Битые заголовки не должны давать NaN/деление на ноль в геометрии и тайминге.
    if (isNaN(bpm) || bpm <= 0) bpm = 120
    if (!Number.isFinite(delay)) delay = 0
    if (!Number.isFinite(beat) || beat <= 0) beat = 4
    if (!Number.isFinite(split) || split <= 0) split = 4

    const rows: string[] = []
    while (i < lines.length && !lines[i].startsWith(':')) {
      const row = lines[i].trim()
      if (row.length > 0) rows.push(row)
      i++
    }

    rawBlocks.push({ bpm, delay, beat, split, rows })
  }

  return { mode, rawBlocks }
}

// carryOver: cols with active holds from previous block (mutated in-place)
function rowsToNotes(rows: string[], carryOver: Map<number, boolean>): Note[] {
  const notes: Note[] = []
  // Открытый холд по колонке. Холд завершается ТОЛЬКО по 'W'; промежуточные 'H' —
  // тело, хвостовые '.' и пустые блоки его НЕ обрывают (см. гиммики CS241).
  const holdStarts = new Map<number, { row: number; continued: boolean }>()

  // Seed holds carried over from previous block
  carryOver.forEach((_, col) => {
    holdStarts.set(col, { row: 0, continued: true })
  })
  carryOver.clear()

  for (let row = 0; row < rows.length; row++) {
    const rowStr = rows[row]
    for (let col = 0; col < rowStr.length; col++) {
      const ch = rowStr[col]
      if (ch === 'X') {
        notes.push({ row, col, type: 'tap' })
      } else if (ch === 'M') {
        holdStarts.set(col, { row, continued: false })
      } else if (ch === 'W') {
        const hold = holdStarts.get(col)
        if (hold !== undefined) {
          const note: Note = { row: hold.row, col, type: 'hold', endRow: row }
          if (hold.continued) note.continued = true
          notes.push(note)
          holdStarts.delete(col)
        }
      }
      // 'H' — тело холда; отдельно не трекаем (диапазон row..endRow подразумевает его).
    }
  }

  // Холды, открытые на конце блока (W не встретился): тянутся до конца блока и
  // продолжаются дальше (continues) — сквозь хвостовые '.' и пустые блоки, пока не
  // встретят 'W'. Так длинная нота не рвётся на промежуточных пустых строках/блоках.
  holdStarts.forEach((hold, col) => {
    const note: Note = { row: hold.row, col, type: 'hold', endRow: Math.max(0, rows.length - 1), continues: true }
    if (hold.continued) note.continued = true
    notes.push(note)
    carryOver.set(col, true)
  })

  return notes
}

export function parseUcs(text: string): Chart {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const { mode, rawBlocks } = parseRawBlocks(lines)

  const carryOver = new Map<number, boolean>()
  const blocks: Block[] = rawBlocks.map(rb => {
    const rowCount = rb.rows.length
    // measures дробное: rowCount/(beat*split). В гиммик-чартах (см. CS241) большинство
    // блоков — неполные такты (< 1 measure). rowCount хранится как авторитетное целое
    // число строк, measures — точная дробь для отображения/правки.
    const measures = rowCount / blockCells(rb.beat, rb.split)
    return {
      id: uuidv4(),
      bpm: rb.bpm,
      delay: rb.delay,
      beat: rb.beat,
      split: rb.split,
      measures,
      rowCount,
      notes: rowsToNotes(rb.rows, carryOver),
    }
  })

  return {
    id: uuidv4(),
    version: 1,
    meta: { title: '', artist: '' },
    chartType: mode,
    difficulty: 1,
    blocks,
  }
}
