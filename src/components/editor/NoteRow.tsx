import { COLUMN_WIDTH } from '@/utils/geometry'
import { useEditorStore } from '@/store/editorStore'
import type { Block } from '@/types/chart'

export type CellType = 'tap' | 'hold-start' | 'hold-body' | 'hold-end'

const DIRECTIONS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']

function ArrowCellFill({ type, col, skin, ghost }: { type: CellType | undefined; col: number; skin: string; ghost?: boolean }) {
  if (!type) return null
  const dir = DIRECTIONS[col % 5]
  const base = `/skin/${skin}`
  const opacity = ghost ? 'opacity-50' : ''

  if (type === 'tap') {
    return (
      <img
        src={`${base}/${dir}-Tap-Note.png`}
        className={`absolute left-0 ${opacity} pointer-events-none`}
        style={{ width: COLUMN_WIDTH, height: COLUMN_WIDTH, top: 0, transform: 'translateY(-50%)' }}
        draggable={false}
      />
    )
  }
  if (type === 'hold-start') {
    return (
      <>
        <div
          className={`absolute left-0 ${opacity} pointer-events-none`}
          style={{
            top: 0,
            bottom: 0,
            width: COLUMN_WIDTH,
            backgroundImage: `url(${base}/${dir}-Hold-Body.png)`,
            backgroundSize: `${COLUMN_WIDTH}px auto`,
            backgroundRepeat: 'repeat-y',
          }}
        />
        <img
          src={`${base}/${dir}-Tap-Note.png`}
          className={`absolute left-0 ${opacity} pointer-events-none`}
          style={{ width: COLUMN_WIDTH, height: COLUMN_WIDTH, top: 0, transform: 'translateY(-50%)', zIndex: 1 }}
          draggable={false}
        />
      </>
    )
  }
  if (type === 'hold-body') {
    return (
      <div
        className={`absolute inset-0 ${opacity} pointer-events-none`}
        style={{
          backgroundImage: `url(${base}/${dir}-Hold-Body.png)`,
          backgroundSize: `${COLUMN_WIDTH}px auto`,
          backgroundRepeat: 'repeat-y',
        }}
      />
    )
  }
  if (type === 'hold-end') {
    return (
      <img
        src={`${base}/${dir}-Hold-BottomCap.png`}
        className={`absolute left-0 top-0 ${opacity} pointer-events-none`}
        style={{ width: COLUMN_WIDTH, height: COLUMN_WIDTH }}
        draggable={false}
      />
    )
  }
  return null
}

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
  const showColumnDividers = useEditorStore(s => s.showColumnDividers)
  const activeSkin = useEditorStore(s => s.activeSkin)

  return (
    <div
      className={`absolute left-0 flex ${lineClass}`}
      style={{ top, height: Math.max(rh, 1), width: cols * COLUMN_WIDTH }}
    >
      {Array.from({ length: cols }, (_, col) => {
        const realType = cells?.get(col)
        const isPreviewCol = col === previewCol && !realType
        return (
          <div
            key={col}
            className={`relative flex-shrink-0 ${showColumnDividers && col < cols - 1 ? 'border-r border-grid-beat' : ''}`}
            style={{ width: COLUMN_WIDTH, height: '100%' }}
          >
            {activeSkin !== 'blocks'
              ? realType
                ? <ArrowCellFill type={realType} col={col} skin={activeSkin} />
                : isPreviewCol
                  ? <ArrowCellFill type={previewType} col={col} skin={activeSkin} ghost />
                  : null
              : realType
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
