import { useRef, useState, useMemo, useEffect, useLayoutEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import {
  rowHeight,
  blockPixelHeight,
  blockRowCount,
  BLOCK_DIVIDER_HEIGHT,
  COLUMN_WIDTH,
  CURSOR_LINE_Y,
  LABEL_WIDTH,
} from '@/utils/geometry'
import type { BlockLayout } from '@/utils/geometry'
import { useEditor } from '@/hooks/useEditor'
import { usePlayback } from '@/hooks/usePlayback'
import { computeBlockOffsets, msToScrollY, scrollYToMs } from '@/utils/timing'
import { ColumnHeaders } from './ColumnHeaders'
import { BlockLabels } from './BlockLabels'
import { NoteRow, type CellType } from './NoteRow'
import { BlockDivider } from './BlockDivider'
import { Cursor } from './Cursor'
import type { Block } from '@/types/chart'

function buildRowMap(block: Block): Map<number, Map<number, CellType>> {
  const map = new Map<number, Map<number, CellType>>()
  for (const note of block.notes) {
    if (note.type === 'tap') {
      if (!map.has(note.row)) map.set(note.row, new Map())
      map.get(note.row)!.set(note.col, 'tap')
    } else if (note.type === 'hold') {
      const endRow = note.endRow ?? note.row
      for (let r = note.row; r <= endRow; r++) {
        if (!map.has(r)) map.set(r, new Map())
        const t: CellType =
          r === note.row ? 'hold-start' : r === endRow ? 'hold-end' : 'hold-body'
        map.get(r)!.set(note.col, t)
      }
    }
  }
  return map
}

function buildPreviewTypes(startRow: number, endRow: number): Map<number, CellType> {
  const map = new Map<number, CellType>()
  if (startRow === endRow) {
    map.set(startRow, 'tap')
  } else {
    for (let r = startRow; r <= endRow; r++) {
      map.set(r, r === startRow ? 'hold-start' : r === endRow ? 'hold-end' : 'hold-body')
    }
  }
  return map
}

const BUFFER_PX = 300

export function ChartGrid() {
  const { tabs, activeTabId } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const scale = activeTab?.scale ?? 3

  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerH, setContainerH] = useState(600)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerH(el.clientHeight)
    const ro = new ResizeObserver(() => setContainerH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const blockLayouts = useMemo((): BlockLayout[] => {
    if (!activeTab) return []
    let y = 0
    return activeTab.chart.blocks.map(block => {
      const rh = rowHeight(scale, block.split)
      const totalRows = blockRowCount(block)
      const bh = blockPixelHeight(block, scale)
      const layout: BlockLayout = { block, startY: y, endY: y + bh, rh, totalRows }
      y += bh + BLOCK_DIVIDER_HEIGHT
      return layout
    })
  }, [activeTab, scale])

  if (!activeTab) return null

  const cols = activeTab.chart.chartType === 'Double' ? 10 : 5

  return (
    <ChartGridInner
      blockLayouts={blockLayouts}
      scrollRef={scrollRef}
      scrollTop={scrollTop}
      containerH={containerH}
      cols={cols}
      scale={scale}
      activeTabId={activeTabId}
      onScroll={setScrollTop}
    />
  )
}

interface InnerProps {
  blockLayouts: BlockLayout[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  scrollTop: number
  containerH: number
  cols: number
  scale: number
  activeTabId: string | null
  onScroll: (y: number) => void
}

function ChartGridInner({
  blockLayouts,
  scrollRef,
  scrollTop,
  containerH,
  cols,
  scale,
  activeTabId,
  onScroll,
}: InnerProps) {
  const { tabs } = useTabsStore()
  const { isPlaying, currentTime, setCurrentTime } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const prevChartIdRef = useRef<string | undefined>(activeTab?.chart.id)
  const prevTabIdRef = useRef<string | null>(activeTabId)
  useLayoutEffect(() => {
    const prevId = prevChartIdRef.current
    const prevTabId = prevTabIdRef.current
    const newId = activeTab?.chart.id
    prevChartIdRef.current = newId
    prevTabIdRef.current = activeTabId
    // Only restore scroll when chart changed within the same tab (import), not on tab switch
    if (prevId === newId || prevTabId !== activeTabId || !scrollRef.current || blockLayouts.length === 0) return
    const offsets = computeBlockOffsets(blockLayouts.map(l => l.block))
    const y = msToScrollY(currentTime, offsets, blockLayouts)
    scrollRef.current.scrollTop = y
    onScroll(y)
  }, [activeTab?.chart.id, activeTabId, blockLayouts])

  const isPlayingRef = useRef(isPlaying)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  const prevScaleRef = useRef(scale)
  useLayoutEffect(() => {
    const prevScale = prevScaleRef.current
    prevScaleRef.current = scale
    if (prevScale === scale || !scrollRef.current || isPlayingRef.current) return
    const newScrollTop = scrollRef.current.scrollTop * (scale / prevScale)
    scrollRef.current.scrollTop = newScrollTop
    onScroll(newScrollTop)
  }, [scale])

  const highlightRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = scrollRef.current
    const hl = highlightRef.current
    if (!el || !hl) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left - LABEL_WIDTH
    const chartY = e.clientY - rect.top + el.scrollTop - CURSOR_LINE_Y
    const col = Math.floor(x / COLUMN_WIDTH)
    if (col < 0 || col >= cols) { hl.style.display = 'none'; return }
    for (const layout of blockLayouts) {
      if (chartY >= layout.startY && chartY < layout.endY) {
        const row = Math.floor((chartY - layout.startY) / layout.rh)
        if (row >= 0 && row < layout.totalRows) {
          hl.style.display = 'block'
          hl.style.left = `${col * COLUMN_WIDTH}px`
          hl.style.top = `${layout.startY + row * layout.rh}px`
          hl.style.height = `${layout.rh}px`
          return
        }
      }
    }
    hl.style.display = 'none'
  }

  const handleMouseLeave = () => {
    if (highlightRef.current) highlightRef.current.style.display = 'none'
  }

  const blocks = useMemo(() => blockLayouts.map(l => l.block), [blockLayouts])
  usePlayback(blocks, blockLayouts, scrollRef)

  const handleScroll = (scrollTop: number) => {
    onScroll(scrollTop)
    if (!isPlaying) {
      const offsets = computeBlockOffsets(blocks)
      setCurrentTime(scrollYToMs(scrollTop, offsets, blockLayouts))
    }
  }

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview } =
    useEditor(blockLayouts, scrollRef, activeTabId, cols)

  const rowMaps = useMemo(() => {
    const maps = new Map<string, Map<number, Map<number, CellType>>>()
    if (!activeTab) return maps
    for (const block of activeTab.chart.blocks) {
      maps.set(block.id, buildRowMap(block))
    }
    return maps
  }, [activeTab?.chart.blocks])

  const previewTypes = useMemo(
    () => preview ? buildPreviewTypes(preview.startRow, preview.endRow) : null,
    [preview],
  )

  if (!activeTab) return null

  const totalHeight =
    blockLayouts.length > 0
      ? blockLayouts[blockLayouts.length - 1].endY + BLOCK_DIVIDER_HEIGHT
      : 0

  const visTop = scrollTop - CURSOR_LINE_Y - BUFFER_PX
  const visBot = scrollTop - CURSOR_LINE_Y + containerH + BUFFER_PX

  const notesWidth = cols * COLUMN_WIDTH

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0">
        <div className="shrink-0 border-b border-r border-grid-beat bg-card" style={{ width: LABEL_WIDTH, height: 32 }} />
        <ColumnHeaders cols={cols} />
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-auto bg-grid select-none"
        style={{ touchAction: 'pan-y' }}
        onScroll={e => handleScroll(e.currentTarget.scrollTop)}
        onContextMenu={e => e.preventDefault()}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <Cursor />
        <div style={{ height: CURSOR_LINE_Y, flexShrink: 0 }} />
        <div style={{ position: 'relative', height: totalHeight, width: LABEL_WIDTH + notesWidth }}>
          <BlockLabels blockLayouts={blockLayouts} totalHeight={totalHeight} />
          <div
            style={{ position: 'absolute', left: LABEL_WIDTH, top: 0, width: notesWidth, height: totalHeight }}
          >
            <div
              ref={highlightRef}
              className="grid-cell-hover"
              style={{
                display: 'none',
                position: 'absolute',
                width: COLUMN_WIDTH,
                pointerEvents: 'none',
                zIndex: 2,
              }}
            />
            {blockLayouts.map(({ block, startY, endY, rh, totalRows }) => {
              if (endY + BLOCK_DIVIDER_HEIGHT < visTop || startY > visBot) return null

              const rowMap = rowMaps.get(block.id)!
              const firstRow = Math.max(0, Math.floor((visTop - startY) / rh))
              const lastRow = Math.min(totalRows - 1, Math.ceil((visBot - startY) / rh))

              const isPreviewBlock = preview?.blockId === block.id
              const rows: React.ReactNode[] = []
              for (let r = firstRow; r <= lastRow; r++) {
                const previewType = isPreviewBlock ? previewTypes?.get(r) : undefined
                rows.push(
                  <NoteRow
                    key={r}
                    row={r}
                    block={block}
                    cols={cols}
                    rh={rh}
                    top={startY + r * rh}
                    rowMap={rowMap}
                    previewCol={isPreviewBlock && previewType ? preview!.col : undefined}
                    previewType={previewType}
                  />
                )
              }

              return (
                <div key={block.id}>
                  {rows}
                  <BlockDivider top={endY} cols={cols} />
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ height: Math.max(0, containerH - CURSOR_LINE_Y), flexShrink: 0 }} />
      </div>
    </div>
  )
}
