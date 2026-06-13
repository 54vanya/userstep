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
import { BlockLayer } from './BlockLayer'
import { GridBlock } from './GridLayer'
import { Cursor } from './Cursor'
import type { Note } from '@/types/chart'

export function ChartGrid() {
  const { tabs, activeTabId } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const scale = activeTab?.scale ?? 3

  const scrollRef = useRef<HTMLDivElement>(null)
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
      containerH={containerH}
      cols={cols}
      scale={scale}
      activeTabId={activeTabId}
    />
  )
}

interface InnerProps {
  blockLayouts: BlockLayout[]
  scrollRef: React.RefObject<HTMLDivElement | null>
  containerH: number
  cols: number
  scale: number
  activeTabId: string | null
}

function ChartGridInner({
  blockLayouts,
  scrollRef,
  containerH,
  cols,
  scale,
  activeTabId,
}: InnerProps) {
  const { tabs } = useTabsStore()
  const { isPlaying, currentTime, setCurrentTime, showColumnDividers, showRowLines } = useEditorStore()
  const { addBlock } = useChart()
  // Стабильная ссылка для BlockRail (иначе memo бесполезен — addBlock новый каждый рендер).
  const addBlockRef = useRef(addBlock)
  addBlockRef.current = addBlock
  const stableAddBlock = useCallback(() => addBlockRef.current(), [])
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

  // Слой, который во время playback двигается transform'ом (вместо scrollTop).
  const contentRef = useRef<HTMLDivElement>(null)
  // Под-слой сетки внутри contentRef: двигается вместе с контентом, но в режиме
  // pixel-snap получает контр-трансформ на дробный остаток, чтобы тонкие линии
  // ложились на физические пиксели (спрайты нот при этом остаются сабпиксельными).
  const gridRef = useRef<HTMLDivElement>(null)
  // Текущая позиция воспроизведения (px чарта); scrollTop при playback заморожен.
  const playbackYRef = useRef(0)

  // Восстановление скролла по currentTime при смене чарта: переключение вкладки
  // (currentTime уже свопнут в сторе на время этой вкладки), импорт в текущую,
  // а также ПЕРВЫЙ маунт (undefined → newId) — чтобы восстановить позицию из
  // сессии после перезагрузки страницы.
  const prevChartIdRef = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    // Не двигаем prevChartIdRef, пока нет layouts/скроллера — иначе на первом
    // маунте с ещё пустыми layouts ref «съел» бы id и восстановление не сработало.
    if (!scrollRef.current || blockLayouts.length === 0) return
    const prevId = prevChartIdRef.current
    const newId = activeTab?.chart.id
    if (prevId === newId) return
    prevChartIdRef.current = newId
    const offsets = computeBlockOffsets(blockLayouts.map(l => l.block))
    const y = msToScrollY(currentTime, offsets, blockLayouts)
    scrollRef.current.scrollTop = y
    // Чтобы возможный cleanup playback-цикла не вернул scrollTop на позицию
    // прошлой вкладки — синхронизируем якорь.
    playbackYRef.current = y
  }, [activeTab?.chart.id, activeTabId, blockLayouts])

  const isPlayingRef = useRef(isPlaying)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // Эффективный скролл-офсет для перевода экранных координат в координаты чарта:
  // при playback — живая позиция воспроизведения, иначе — нативный scrollTop.
  const scrollOffset = useCallback(
    () => (isPlayingRef.current ? playbackYRef.current : scrollRef.current?.scrollTop ?? 0),
    [scrollRef],
  )

  const prevScaleRef = useRef(scale)
  useLayoutEffect(() => {
    const prevScale = prevScaleRef.current
    prevScaleRef.current = scale
    if (prevScale === scale || !scrollRef.current || isPlayingRef.current) return
    const newScrollTop = scrollRef.current.scrollTop * (scale / prevScale)
    scrollRef.current.scrollTop = newScrollTop
  }, [scale])

  const highlightRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = scrollRef.current
    const hl = highlightRef.current
    if (!el || !hl) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartY = e.clientY - rect.top + scrollOffset() - CURSOR_LINE_Y
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
  usePlayback(blocks, blockLayouts, scrollRef, { contentRef, gridRef, playbackYRef })

  // Ручной скролл/скраб → синхронизируем currentTime. Во время playback вертикальный
  // скролл заблокирован (overflowY:hidden), так что сюда долетают только ручные
  // скроллы на паузе; isPlaying-гард — страховка от остаточных событий.
  const handleScroll = (newScrollTop: number) => {
    if (isPlaying) return
    const offsets = computeBlockOffsets(blocks)
    setCurrentTime(scrollYToMs(newScrollTop, offsets, blockLayouts))
  }

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview } =
    useEditor(blockLayouts, scrollRef, activeTabId, cols, scrollOffset)

  // Превью растягивающегося холда → синтетическая нота на каждый затронутый блок
  // (включая кросс-блочные части через continued/continues). Не зависит от scroll.
  const previewNotesByBlock = useMemo(() => {
    if (!preview) return null
    const result = new Map<string, Note>()
    const startIdx = blockLayouts.findIndex(l => l.block.id === preview.startBlockId)
    const endIdx = blockLayouts.findIndex(l => l.block.id === preview.endBlockId)
    for (let i = startIdx; i <= endIdx; i++) {
      const layout = blockLayouts[i]
      if (!layout) continue
      const isFirst = i === startIdx
      const isLast = i === endIdx
      const startR = isFirst ? preview.startRow : 0
      const endR = isLast ? preview.endRow : layout.totalRows - 1
      const continued = !isFirst
      const continues = !isLast
      const note: Note = startR === endR && !continued && !continues
        ? { row: startR, col: preview.col, type: 'tap' }
        : { row: startR, col: preview.col, type: 'hold', endRow: endR, continued, continues }
      result.set(layout.block.id, note)
    }
    return result
  }, [preview, blockLayouts])

  if (!activeTab) return null

  const totalHeight =
    blockLayouts.length > 0
      ? blockLayouts[blockLayouts.length - 1].endY + BLOCK_DIVIDER_HEIGHT
      : 0

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
        className="flex-1 overflow-x-auto bg-grid select-none"
        // Во время playback вьюпорт двигается transform'ом от зафиксированного на
        // старте scrollTop. Нативный вертикальный скролл (тачпад/колесо) сдвинул бы
        // реальный scrollTop и рассинхронил бы конвейер с курсором — поэтому на время
        // playback вертикальный скролл блокируем (scrollbar-gutter держит ширину,
        // чтобы контент не прыгал по горизонтали при появлении/скрытии скроллбара).
        style={{
          touchAction: isPlaying ? 'none' : 'pan-y',
          overflowY: isPlaying ? 'hidden' : 'auto',
          scrollbarGutter: 'stable',
        }}
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
        <div ref={contentRef} style={{ position: 'relative', height: totalHeight, width: notesWidth + RAIL_WIDTH }}>
          <div
            ref={gridRef}
            className="absolute left-0 top-0 pointer-events-none"
            style={{ width: notesWidth, height: totalHeight }}
          >
            {blockLayouts.map(({ block, startY, endY, rh }) => (
              <GridBlock
                key={block.id}
                block={block}
                startY={startY}
                height={endY - startY}
                rh={rh}
                notesWidth={notesWidth}
                showCols={showColumnDividers}
                showRows={showRowLines}
              />
            ))}
          </div>
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
            {blockLayouts.map(({ block, startY, endY, rh, totalRows }) => (
              <BlockLayer
                key={block.id}
                block={block}
                startY={startY}
                rh={rh}
                totalRows={totalRows}
                height={endY - startY}
                notesWidth={notesWidth}
                previewNote={previewNotesByBlock?.get(block.id) ?? null}
              />
            ))}
          </div>
          <BlockRail
            blockLayouts={blockLayouts}
            totalHeight={totalHeight}
            openBlockId={openBlockId}
            onBlockClick={handleRailBlockClick}
            onAddBlock={stableAddBlock}
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
