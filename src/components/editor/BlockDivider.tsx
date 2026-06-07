import { BLOCK_DIVIDER_HEIGHT, COLUMN_WIDTH } from '@/utils/geometry'

interface Props {
  top: number
  cols: number
}

export function BlockDivider({ top, cols }: Props) {
  return (
    <div
      className="absolute left-0 border-t border-grid-beat"
      style={{ top, height: BLOCK_DIVIDER_HEIGHT, width: cols * COLUMN_WIDTH }}
    />
  )
}
