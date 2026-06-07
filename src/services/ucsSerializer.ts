import type { Block, Chart, Note } from '@/types/chart'

function notesToRows(notes: Note[], totalRows: number, cols: number): string[] {
  // Initialize rows with dots
  const rows: string[][] = Array.from({ length: totalRows }, () => Array(cols).fill('.'))

  for (const note of notes) {
    if (note.type === 'tap') {
      if (note.row < totalRows && note.col < cols) {
        rows[note.row][note.col] = 'X'
      }
    } else if (note.type === 'hold') {
      const endRow = note.endRow ?? note.row
      if (note.row < totalRows && note.col < cols) {
        rows[note.row][note.col] = 'M'
      }
      for (let r = note.row + 1; r < endRow && r < totalRows; r++) {
        if (note.col < cols) rows[r][note.col] = 'H'
      }
      if (endRow < totalRows && endRow !== note.row && note.col < cols) {
        rows[endRow][note.col] = 'W'
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

  const totalRows = block.beat * block.split * block.measures
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
