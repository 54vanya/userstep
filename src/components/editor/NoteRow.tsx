import { COLUMN_WIDTH } from '@/utils/geometry'
import type { Block } from '@/types/chart'

export type CellType = 'tap' | 'hold-start' | 'hold-body' | 'hold-end'

interface Props {
  row: number
  block: Block
  cols: number
  rh: number
  top: number
  rowMap: Map<number, Map<number, CellType>>
  previewCol?: number
  previewType?: CellType
}

function getLineClass(row: number, block: Block): string {
  const perMeasure = block.beat * block.split
  const perBeat = block.split
  if ((row + 1) % perMeasure === 0) return 'border-b-2 border-grid-measure'
  if ((row + 1) % perBeat === 0) return 'border-b border-grid-beat'
  return 'border-b border-grid-sub'
}

function CellFill({ type, ghost }: { type: CellType | undefined; ghost?: boolean }) {
  if (!type) return null
  const opacity = ghost ? 'opacity-50' : ''
  if (type === 'tap') {
    return <div className={`absolute inset-x-[1px] inset-y-0 rounded-sm bg-blue-400 border border-blue-300 shadow-sm ${opacity}`} />
  }
  if (type === 'hold-start') {
    return <div className={`absolute inset-0 bg-green-500 rounded-t-sm border-t border-x border-green-400 ${opacity}`} />
  }
  if (type === 'hold-body') {
    return <div className={`absolute inset-x-1 inset-y-0 bg-green-700 ${opacity}`} />
  }
  if (type === 'hold-end') {
    return <div className={`absolute inset-0 bg-green-500 rounded-b-sm border-b border-x border-green-400 ${opacity}`} />
  }
  return null
}

export function NoteRow({ row, block, cols, rh, top, rowMap, previewCol, previewType }: Props) {
  const cells = rowMap.get(row)
  const lineClass = getLineClass(row, block)

  return (
    <div
      className={`absolute left-0 flex ${lineClass}`}
      style={{ top, height: Math.max(rh, 1), width: cols * COLUMN_WIDTH }}
    >
      {Array.from({ length: cols }, (_, col) => {
        const isP2Start = cols === 10 && col === 5
        const realType = cells?.get(col)
        const isPreviewCol = col === previewCol && !realType
        return (
          <div
            key={col}
            className={`relative flex-shrink-0 ${isP2Start ? 'border-l border-grid-beat' : ''}`}
            style={{ width: COLUMN_WIDTH, height: '100%' }}
          >
            {realType
              ? <CellFill type={realType} />
              : isPreviewCol
                ? <CellFill type={previewType} ghost />
                : null
            }
          </div>
        )
      })}
    </div>
  )
}
