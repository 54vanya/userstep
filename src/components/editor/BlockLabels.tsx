import type { BlockLayout } from '@/utils/geometry'
import { LABEL_WIDTH } from '@/utils/geometry'

interface Props {
  blockLayouts: BlockLayout[]
  totalHeight: number
}

export function BlockLabels({ blockLayouts, totalHeight }: Props) {
  return (
    <div
      className="border-r border-grid-beat bg-card shrink-0"
      style={{ position: 'sticky', left: 0, width: LABEL_WIDTH, height: totalHeight, zIndex: 10 }}
    >
      {blockLayouts.map(({ block, startY }, i) => (
        <div
          key={block.id}
          className="absolute left-0 right-0 px-1 pt-1 text-[9px] text-muted-foreground leading-tight"
          style={{ top: startY }}
        >
          <div className="font-mono text-foreground text-[10px]">#{i + 1}</div>
          <div>{block.bpm}</div>
          <div>{block.beat}/{block.split}</div>
        </div>
      ))}
    </div>
  )
}
