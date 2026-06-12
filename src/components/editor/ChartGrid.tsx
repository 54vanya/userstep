import { useRef, useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import {
  rowHeight,
  blockPixelHeight,
  blockRowCount,
  BLOCK_DIVIDER_HEIGHT,
  COLUMN_WIDTH,
  CURSOR_LINE_Y,
  RAIL_WIDTH,
} from '@/utils/geometry'
import type { BlockLayout } from '@/utils/geometry'
import { useChart } from '@/hooks/useChart'
import { useEditor } from '@/hooks/useEditor'
import { usePlayback } from '@/hooks/usePlayback'
import { computeBlockOffsets, msToScrollY, scrollYToMs } from '@/utils/timing'
import { ColumnHeaders } from './ColumnHeaders'
import { BlockRail } from './BlockRail'
import { BlockSettingsPopup } from './BlockSettingsPopup'
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
        const isStart = r === note.row && !note.continued
        const isEnd = r === endRow && !note.continues
        const t: CellType = isStart ? 'hold-start' : isEnd ? 'hold-end' : 'hold-body'
        map.get(r)!.set(note.col, t)
      }
    }
  }
  return map
}

function buildPreviewTypes(
  startRow: number,
  endRow: number,
  continued = false,
  continues = false,
): Map<number, CellType> {
  const map = new Map<number, CellType>()
  if (startRow === endRow && !continued && !continues) {
    map.set(startRow, 'tap')
  } else {
    for (let r = startRow; r <= endRow; r++) {
      const isStart = r === startRow && !continued
      const isEnd = r === endRow && !continues
      map.set(r, isStart ? 'hold-start' : isEnd ? 'hold-end' : 'hold-body')
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
  const { addBlock } = useChart()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const [openBlockId, setOpenBlockId] = useState<string | null>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; editorTop: number; editorBottom: number }>({ top: 0, left: 0, editorTop: 0, editorBottom: 0 })

  const handleRailBlockClick = useCallback((blockId: string) => {
    if (openBlockId === blockId) {
      setOpenBlockId(null)
      return
    }
    setOpenBlockId(blockId)
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const rect = scrollEl.getBoundingClientRect()
    const layout = blockLayouts.find(l => l.block.id === blockId)
    if (!layout) return
    const blockScreenTop = rect.top + CURSOR_LINE_Y + layout.startY - scrollEl.scrollTop
    const POPUP_W = 224
    const railRight = rect.left + cols * COLUMN_WIDTH + RAIL_WIDTH - scrollEl.scrollLeft
    let left = railRight + 8
    if (left + POPUP_W > window.innerWidth - 8) {
      left = railRight - POPUP_W - 8
    }
    setPopupPos({ top: blockScreenTop, left: Math.max(8, left), editorTop: rect.top, editorBottom: rect.bottom })
  }, [openBlockId, blockLayouts, scrollRef, cols])

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
    const x = e.clientX - rect.left
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

  const previewTypesByBlock = useMemo(() => {
    if (!preview) return null
    const result = new Map<string, Map<number, CellType>>()
    const startIdx = blockLayouts.findIndex(l => l.block.id === preview.startBlockId)
    const endIdx = blockLayouts.findIndex(l => l.block.id === preview.endBlockId)
    for (let i = startIdx; i <= endIdx; i++) {
      const layout = blockLayouts[i]
      if (!layout) continue
      const isFirst = i === startIdx
      const isLast = i === endIdx
      const startR = isFirst ? preview.startRow : 0
      const endR = isLast ? preview.endRow : layout.totalRows - 1
      result.set(layout.block.id, buildPreviewTypes(startR, endR, !isFirst, !isLast))
    }
    return result
  }, [preview, blockLayouts])

  if (!activeTab) return null

  const totalHeight =
    blockLayouts.length > 0
      ? blockLayouts[blockLayouts.length - 1].endY + BLOCK_DIVIDER_HEIGHT
      : 0

  const visTop = scrollTop - CURSOR_LINE_Y - BUFFER_PX
  const visBot = scrollTop - CURSOR_LINE_Y + containerH + BUFFER_PX

  const notesWidth = cols * COLUMN_WIDTH

  const openBlockIndex = openBlockId
    ? blockLayouts.findIndex(l => l.block.id === openBlockId)
    : -1

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0">
        <ColumnHeaders cols={cols} />
        <div className="shrink-0 border-b border-l border-grid-beat bg-card" style={{ width: RAIL_WIDTH, height: 32 }} />
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
        <div style={{ position: 'relative', height: totalHeight, width: notesWidth + RAIL_WIDTH }}>
          <div
            style={{ position: 'absolute', left: 0, top: 0, width: notesWidth, height: totalHeight }}
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

              const blockPreviewTypes = previewTypesByBlock?.get(block.id) ?? null
              const rows: React.ReactNode[] = []
              for (let r = firstRow; r <= lastRow; r++) {
                const previewType = blockPreviewTypes?.get(r)
                rows.push(
                  <NoteRow
                    key={r}
                    row={r}
                    block={block}
                    cols={cols}
                    rh={rh}
                    top={startY + r * rh}
                    rowMap={rowMap}
                    previewCol={blockPreviewTypes && previewType ? preview!.col : undefined}
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
          <BlockRail
            blockLayouts={blockLayouts}
            totalHeight={totalHeight}
            openBlockId={openBlockId}
            onBlockClick={handleRailBlockClick}
            onAddBlock={addBlock}
          />
        </div>
        <div style={{ height: Math.max(0, containerH - CURSOR_LINE_Y), flexShrink: 0 }} />
      </div>
      {openBlockId !== null && openBlockIndex >= 0 && (
        <BlockSettingsPopup
          blockId={openBlockId}
          index={openBlockIndex}
          top={popupPos.top}
          left={popupPos.left}
          editorTop={popupPos.editorTop}
          editorBottom={popupPos.editorBottom}
          onClose={() => setOpenBlockId(null)}
        />
      )}
    </div>
  )
}
