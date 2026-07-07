import type { Block, Chart, Note } from '@/types/chart'
import { chartCols } from '@/types/chart'
import { blockRowCount } from '@/utils/geometry'
import { noteEnd } from '@/utils/holds'

function notesToRows(notes: Note[], totalRows: number, cols: number): string[] {
  const rows: string[][] = Array.from({ length: totalRows }, () => Array(cols).fill('.'))

  for (const note of notes) {
    if (note.type === 'tap') {
      if (note.row < totalRows && note.col < cols) {
        rows[note.row][note.col] = 'X'
      }
    } else if (note.type === 'hold') {
      const endRow = noteEnd(note)
      const col = note.col
      if (col >= cols) continue

      if (note.continued && endRow === note.row) {
        // Continuation that ends on the very first row: W closes the chain,
        // H keeps it going (1-row block in the middle of a cross-block hold)
        if (note.row < totalRows) rows[note.row][col] = note.continues ? 'H' : 'W'
      } else {
        const startChar = note.continued ? 'H' : 'M'
        if (note.row < totalRows) rows[note.row][col] = startChar
        for (let r = note.row + 1; r < endRow && r < totalRows; r++) rows[r][col] = 'H'
        if (endRow > note.row && endRow < totalRows) {
          rows[endRow][col] = note.continues ? 'H' : 'W'
        }
      }
    }
  }

  return rows.map(r => r.join(''))
}

function serializeBlock(block: Block, cols: number): string {
  const lines: string[] = []
  lines.push(`:BPM=${block.bpm}`)
  lines.push(`:Delay=${block.delay}`)
  lines.push(`:Beat=${block.beat}`)
  lines.push(`:Split=${block.split}`)

  const totalRows = blockRowCount(block)
  const rows = notesToRows(block.notes, totalRows, cols)
  lines.push(...rows)

  return lines.join('\n')
}

export function serializeToUcs(chart: Chart): string {
  const cols = chartCols(chart)
  const header = [
    ':Format=1',
    `:Mode=${chart.chartType}`,
  ]

  const blockLines = chart.blocks.map(b => serializeBlock(b, cols))

  return [...header, ...blockLines].join('\n') + '\n'
}

export function serializeToJson(chart: Chart): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = chart
  return JSON.stringify({ ...rest, id: chart.id }, null, 2)
}
