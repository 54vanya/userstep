import { memo } from 'react'
import type { BlockLayout } from '@/utils/geometry'
import { RAIL_WIDTH } from '@/utils/geometry'
import { sectionTint, type RailColoring } from '@/utils/viewSettings'

interface Props {
  blockLayouts: BlockLayout[]
  totalHeight: number
  openBlockId: string | null
  railColoring: RailColoring
  onBlockClick: (blockId: string) => void
  onAddBlock: () => void
}

export const BlockRail = memo(function BlockRail({ blockLayouts, totalHeight, openBlockId, railColoring, onBlockClick, onAddBlock }: Props) {
  return (
    <div
      data-testid="block-rail"
      className="border-l border-grid-beat bg-card"
      style={{ position: 'absolute', right: 0, top: 0, width: RAIL_WIDTH, zIndex: 10 }}
    >
      <div style={{ height: totalHeight }}>
        {blockLayouts.map(({ block, startY, endY }, i) => {
          // Короткие блоки (неполные такты на больших split) имеют крошечную высоту —
          // обрезаем содержимое (overflow-hidden) и показываем строки только если
          // влезают, иначе подписи наезжали бы на соседние блоки.
          const h = endY - startY
          const isOpen = openBlockId === block.id
          // Тинт окраски через одну — только когда блок не открыт (у открытого свой
          // bg-accent). Ховер рисуем отдельным overlay (group-hover), иначе inline
          // backgroundColor тинта перекрыл бы hover-класс.
          const tint = isOpen ? undefined : sectionTint(railColoring, i)
          return (
            <div
              key={block.id}
              className={`group absolute left-0 right-0 overflow-hidden border-t border-grid-beat px-1 text-[9px] leading-tight whitespace-nowrap cursor-pointer select-none transition-colors ${
                isOpen ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
              }`}
              style={{ top: startY, height: h, backgroundColor: tint }}
              onClick={() => onBlockClick(block.id)}
            >
              {!isOpen && <div className="absolute inset-0 pointer-events-none transition-colors group-hover:bg-accent/40" />}
              {h >= 12 && <div className="relative font-mono text-[10px] text-foreground">#{i + 1}</div>}
              {h >= 23 && (
                <div className="relative flex items-baseline gap-1">
                  <span>{block.bpm}</span>
                  <span>{block.beat}/{block.split}</span>
                </div>
              )}
              {block.delay !== 0 && h >= 33 && (
                <div className="relative text-amber-500" title="Delay">Δ{block.delay}ms</div>
              )}
            </div>
          )
        })}
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
