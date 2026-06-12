import type { Block, Chart, Note } from '@/types/chart'

function notesToRows(notes: Note[], totalRows: number, cols: number): string[] {
  const rows: string[][] = Array.from({ length: totalRows }, () => Array(cols).fill('.'))

  for (const note of notes) {
    if (note.type === 'tap') {
      if (note.row < totalRows && note.col < cols) {
        rows[note.row][note.col] = 'X'
      }
    } else if (note.type === 'hold') {
      const endRow = note.endRow ?? note.row
      const col = note.col
      if (col >= cols) continue

      if (note.continued && endRow === note.row) {
        // Continuation that ends on the very first row: write W
        if (note.row < totalRows) rows[note.row][col] = 'W'
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

function serializeBlock(block: Block, cols: number, isFirst: boolean): string {
  const lines: string[] = []
  lines.push(`:BPM=${block.bpm}`)
  lines.push(`:Delay=${isFirst ? block.delay : 0}`)
  lines.push(`:Beat=${block.beat}`)
  lines.push(`:Split=${block.split}`)

  const totalRows = block.rowCount ?? block.beat * block.split * block.measures
  const rows = notesToRows(block.notes, totalRows, cols)
  lines.push(...rows)

  return lines.join('\n')
}

export function serializeToUcs(chart: Chart): string {
  const cols = chart.chartType === 'Double' ? 10 : 5
  const header = [
    ':Format=1',
    `:Mode=${chart.chartType}`,
  ]

  const blockLines = chart.blocks.map((b, i) => serializeBlock(b, cols, i === 0))

  return [...header, ...blockLines].join('\n') + '\n'
}

export function serializeToJson(chart: Chart): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = chart
  return JSON.stringify({ ...rest, id: chart.id }, null, 2)
}
