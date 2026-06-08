import { COLUMN_WIDTH } from '@/utils/geometry'

const ARROWS = ['↙', '↖', null, '↗', '↘']
const ARROW_COLORS = [
  'text-orange-400',
  'text-blue-400',
  'text-yellow-300',
  'text-blue-400',
  'text-orange-400',
]

function BeveledSquare({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={color}>
      <polygon points="4,0 12,0 16,4 16,12 12,16 4,16 0,12 0,4" />
    </svg>
  )
}

interface Props {
  cols: number
}

export function ColumnHeaders({ cols }: Props) {
  return (
    <div
      className="flex shrink-0 bg-card border-b border-grid-beat select-none"
      style={{ height: 32, width: cols * COLUMN_WIDTH }}
    >
      {Array.from({ length: cols }, (_, i) => {
        const idx = i % 5
        const arrow = ARROWS[idx]
        return (
          <div
            key={i}
            className={`flex items-center justify-center text-sm font-bold ${ARROW_COLORS[idx]}`}
            style={{ width: COLUMN_WIDTH, flexShrink: 0 }}
          >
            {arrow === null
              ? <BeveledSquare color={ARROW_COLORS[idx]} />
              : arrow}
          </div>
        )
      })}
    </div>
  )
}
