import { useRef, useEffect } from 'react'
import type { BlockLayout } from '@/utils/geometry'

interface Props {
  blockLayouts: BlockLayout[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  totalHeight: number
}

export function BlockLabels({ blockLayouts, scrollRef, totalHeight }: Props) {
  const labelsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const grid = scrollRef.current
    const labels = labelsRef.current
    if (!grid || !labels) return
    const onScroll = () => { labels.scrollTop = grid.scrollTop }
    grid.addEventListener('scroll', onScroll, { passive: true })
    return () => grid.removeEventListener('scroll', onScroll)
  }, [scrollRef])

  return (
    <div className="shrink-0 overflow-hidden border-r border-grid-beat bg-card" style={{ width: 64 }}>
      {/* spacer matching ColumnHeaders height */}
      <div className="h-8 border-b border-grid-beat" />
      <div ref={labelsRef} className="overflow-hidden" style={{ height: 'calc(100% - 2rem)' }}>
        <div style={{ position: 'relative', height: totalHeight }}>
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
      </div>
    </div>
  )
}
