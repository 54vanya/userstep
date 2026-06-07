import { v4 as uuidv4 } from 'uuid'
import type { Block, Chart, ChartMode, Note } from '@/types/chart'

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
      if (meta.startsWith(':Delay=')) delay = parseInt(meta.slice(7).trim(), 10)
      else if (meta.startsWith(':Beat=')) beat = parseInt(meta.slice(6).trim(), 10)
      else if (meta.startsWith(':Split=')) split = parseInt(meta.slice(7).trim(), 10)
      i++
    }

    if (isNaN(bpm) || bpm <= 0) bpm = 120

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

function rowsToNotes(rows: string[]): Note[] {
  const notes: Note[] = []
  // Track active holds: col -> startRow
  const holdStarts = new Map<number, number>()

  for (let row = 0; row < rows.length; row++) {
    const rowStr = rows[row]
    for (let col = 0; col < rowStr.length; col++) {
      const ch = rowStr[col]
      if (ch === 'X') {
        notes.push({ row, col, type: 'tap' })
      } else if (ch === 'M') {
        holdStarts.set(col, row)
      } else if (ch === 'W') {
        const startRow = holdStarts.get(col)
        if (startRow !== undefined) {
          notes.push({ row: startRow, col, type: 'hold', endRow: row })
          holdStarts.delete(col)
        }
      }
      // 'H' (hold body) is implicit between M and W
    }
  }

  // Close any unclosed holds at end of block
  holdStarts.forEach((startRow, col) => {
    notes.push({ row: startRow, col, type: 'hold', endRow: rows.length - 1 })
  })

  return notes
}

export function parseUcs(text: string): Chart {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const { mode, rawBlocks } = parseRawBlocks(lines)

  const blocks: Block[] = rawBlocks.map(rb => {
    const measures = Math.max(1, Math.round(rb.rows.length / (rb.beat * rb.split)))
    return {
      id: uuidv4(),
      bpm: rb.bpm,
      delay: rb.delay,
      beat: rb.beat,
      split: rb.split,
      measures,
      notes: rowsToNotes(rb.rows),
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
