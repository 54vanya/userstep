import { memo } from 'react'
import type { BlockLayout } from '@/utils/geometry'
import { RAIL_WIDTH } from '@/utils/geometry'

interface Props {
  blockLayouts: BlockLayout[]
  totalHeight: number
  openBlockId: string | null
  onBlockClick: (blockId: string) => void
  onAddBlock: () => void
}

export const BlockRail = memo(function BlockRail({ blockLayouts, totalHeight, openBlockId, onBlockClick, onAddBlock }: Props) {
  return (
    <div
      data-testid="block-rail"
      className="border-l border-grid-beat bg-card"
      style={{ position: 'absolute', right: 0, top: 0, width: RAIL_WIDTH, zIndex: 10 }}
    >
      <div style={{ height: totalHeight }}>
        {blockLayouts.map(({ block, startY, endY }, i) => (
          <div
            key={block.id}
            className={`absolute left-0 right-0 border-t border-grid-beat px-1 pt-1 text-[9px] leading-tight cursor-pointer select-none transition-colors ${
              openBlockId === block.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/40'
            }`}
            style={{ top: startY, height: endY - startY }}
            onClick={() => onBlockClick(block.id)}
          >
            <div className="font-mono text-[10px] text-foreground">#{i + 1}</div>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span>{block.bpm}</span>
              <span>{block.beat}/{block.split}</span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onAddBlock}
        title="Add block"
        className="w-full border-t border-grid-beat text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors text-base leading-none py-2 select-none"
      >
        +
      </button>
    </div>
  )
})
