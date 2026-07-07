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
  hitLine,
  hitHalf,
  snapRow,
} from '@/utils/geometry'
import { isTextEntry } from '@/utils/dom'
import { FIELD_ZOOM_STEP } from '@/utils/viewSettings'
import type { BlockLayout } from '@/utils/geometry'
import { useChart } from '@/hooks/useChart'
import { useEditor } from '@/hooks/useEditor'
import { usePlayback } from '@/hooks/usePlayback'
import { computeBlockOffsets, msToScrollY, scrollYToMs, formatMs } from '@/utils/timing'
import { ColumnHeaders } from './ColumnHeaders'
import { BlockRail } from './BlockRail'
import { BlockSettingsPopup } from './BlockSettingsPopup'
import { BlockLayer } from './BlockLayer'
import { GridBlock } from './GridLayer'
import { Cursor } from './Cursor'
import { NoteCounterOverlay } from './NoteCounterOverlay'
import { computeHitTimes } from '@/utils/noteCount'
import { sectionTint } from '@/utils/viewSettings'
import type { Note } from '@/types/chart'

export function ChartGrid() {
  const { tabs, activeTabId } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const fieldZoom = useEditorStore(s => s.fieldZoom)
  // Зум поля — равномерный множитель: per-tab scale (расстояние строк) тоже на него
  // умножается, чтобы поле росло целиком, а не только ноты/колонки.
  const scale = (activeTab?.scale ?? 3) * (fieldZoom / 100)

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
  const { isPlaying, currentTime, setCurrentTime, showColumnDividers, showRowLines, fieldZoom, showNoteCounter, railColoring, selection, setSelection } = useEditorStore()
  // Зум поля: ноты/колонки и хит-линия растут пропорционально (per-tab scale при этом
  // отвечает лишь за расстояние между строками).
  const cw = (COLUMN_WIDTH * fieldZoom) / 100
  const cursorY = (CURSOR_LINE_Y * fieldZoom) / 100
  const { addBlock, updateBlock } = useChart()
  // Стабильная ссылка для BlockRail (иначе memo бесполезен — addBlock новый каждый рендер).
  const addBlockRef = useRef(addBlock)
  addBlockRef.current = addBlock
  const stableAddBlock = useCallback(() => addBlockRef.current(), [])
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Выделение живёт в координатах конкретного чарта — при смене чарта сбрасываем.
  useEffect(() => {
    setSelection(null)
  }, [activeTab?.chart.id, setSelection])

  // Shift+клик по рельсе — выделить блок целиком (block-уровень выделения).
  const handleRailBlockShiftClick = useCallback((blockId: string) => {
    setSelection({ kind: 'block', blockId })
  }, [setSelection])

  // Прямоугольник подсветки выделения (в координатах чарта). Диапазон строк
  // растягиваем на полстроки вверх/вниз (ноты лежат НА линиях), зажимая в блок.
  const selectionRect = useMemo(() => {
    if (!selection) return null
    const layout = blockLayouts.find(l => l.block.id === selection.blockId)
    if (!layout) return null
    if (selection.kind === 'block') {
      return { top: layout.startY, height: layout.endY - layout.startY }
    }
    const top = Math.max(layout.startY, layout.startY + selection.fromRow * layout.rh - layout.rh / 2)
    const bottom = Math.min(layout.endY, layout.startY + selection.toRow * layout.rh + layout.rh / 2)
    return { top, height: Math.max(2, bottom - top) }
  }, [selection, blockLayouts])

  // Resize блока перетаскиванием его нижней границы (полоска на рельсе):
  // при drag'е показываем ghost-линию с числом строк, коммит на pointerup —
  // один updateBlock({ rowCount }) = один undo-снэпшот.
  const resizeRef = useRef<{ blockId: string; startY: number; rh: number } | null>(null)
  const [resizeGhost, setResizeGhost] = useState<{ y: number; rows: number } | null>(null)

  const onResizeDown = (e: React.PointerEvent, blockId: string, startY: number, rh: number) => {
    if (isPlaying) return
    e.stopPropagation()
    e.preventDefault()
    resizeRef.current = { blockId, startY, rh }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current
    const el = scrollRef.current
    if (!r || !el) return
    const py = e.clientY - el.getBoundingClientRect().top + el.scrollTop - cursorY
    const rows = Math.max(1, Math.round((py - r.startY) / r.rh))
    setResizeGhost({ y: r.startY + rows * r.rh, rows })
  }
  const onResizeUp = () => {
    const r = resizeRef.current
    resizeRef.current = null
    if (r && resizeGhost) updateBlock(r.blockId, { rowCount: resizeGhost.rows })
    setResizeGhost(null)
  }
  const onResizeCancel = () => {
    resizeRef.current = null
    setResizeGhost(null)
  }

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
    const blockScreenTop = rect.top + cursorY + layout.startY - scrollEl.scrollTop
    const POPUP_W = 240
    const railRight = rect.left + cols * cw + RAIL_WIDTH - scrollEl.scrollLeft
    let left = railRight + 8
    if (left + POPUP_W > window.innerWidth - 8) {
      left = railRight - POPUP_W - 8
    }
    setPopupPos({ top: blockScreenTop, left: Math.max(8, left), editorTop: rect.top, editorBottom: rect.bottom })
  }, [openBlockId, blockLayouts, scrollRef, cols, cw, cursorY])

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

  // Ctrl+колесо — зум поля (как в StepEdit Lite). Нужен нативный non-passive
  // listener: React вешает onWheel пассивно, preventDefault не сработал бы и
  // браузер зумил бы страницу целиком.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const { fieldZoom: z, setFieldZoom } = useEditorStore.getState()
      setFieldZoom(z + (e.deltaY < 0 ? FIELD_ZOOM_STEP : -FIELD_ZOOM_STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [scrollRef])

  // Клавиатурная навигация (как в StepEdit Lite): ↑/↓ — строка, PgUp/PgDn —
  // страница, Home/End — начало/конец. Во время playback скролл заблокирован.
  // INPUT/SELECT/TEXTAREA пропускаем целиком: range-слайдеры сами ходят стрелками.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (isTextEntry(target) || target.tagName === 'INPUT') return
      const el = scrollRef.current
      if (!el || isPlayingRef.current) return

      const maxY = el.scrollHeight - el.clientHeight
      let targetY: number | null = null
      switch (e.code) {
        case 'ArrowUp':
        case 'ArrowDown': {
          const dir = e.code === 'ArrowDown' ? 1 : -1
          // Шаг — высота строки блока под курсором; позицию снэпим на линию,
          // чтобы серия нажатий шла ровно по строкам.
          const snap = snapRow(el.scrollTop, blockLayouts)
          if (!snap) return
          const lineY = snap.layout.startY + snap.row * snap.layout.rh
          targetY = lineY + dir * snap.layout.rh
          break
        }
        case 'PageUp':
          targetY = el.scrollTop - el.clientHeight
          break
        case 'PageDown':
          targetY = el.scrollTop + el.clientHeight
          break
        case 'Home':
          targetY = 0
          break
        case 'End':
          targetY = maxY
          break
        default:
          return
      }
      e.preventDefault()
      const y = Math.min(maxY, Math.max(0, targetY))
      el.scrollTop = y
      // currentTime синхронно: scroll-событие придёт лишь на следующем кадре, а
      // операции «от плейхеда» (вставка, Ctrl+A) могут случиться раньше него.
      const offsets = computeBlockOffsets(blockLayouts.map(l => l.block))
      useEditorStore.getState().setCurrentTime(scrollYToMs(y, offsets, blockLayouts))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scrollRef, blockLayouts])

  const prevScaleRef = useRef(scale)
  useLayoutEffect(() => {
    const prevScale = prevScaleRef.current
    prevScaleRef.current = scale
    if (prevScale === scale || !scrollRef.current || isPlayingRef.current) return
    const newScrollTop = scrollRef.current.scrollTop * (scale / prevScale)
    scrollRef.current.scrollTop = newScrollTop
  }, [scale])

  const highlightRef = useRef<HTMLDivElement>(null)
  // Статус-бар (время/блок/такт/бит под мышью): пишем в DOM напрямую (как
  // TimeDisplay), без React-ререндеров на каждый mousemove.
  const statusRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = scrollRef.current
    const hl = highlightRef.current
    if (!el || !hl) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const chartY = e.clientY - rect.top + scrollOffset() - cursorY
    const col = Math.floor(x / cw)

    // Статус-бар: ближайшая линия без мёртвых зон (snapRow), независимо от колонки.
    const status = statusRef.current
    if (status) {
      const snap = snapRow(chartY, blockLayouts)
      if (snap) {
        const idx = blockLayouts.indexOf(snap.layout)
        const off = computeBlockOffsets(blocks)[idx]
        const b = snap.layout.block
        const measure = Math.floor(snap.row / Math.max(1, b.beat * b.split)) + 1
        const beat = Math.floor((snap.row % Math.max(1, b.beat * b.split)) / Math.max(1, b.split)) + 1
        const ms = off ? off.startMs + snap.row * off.msPerRow : 0
        status.textContent =
          `${formatMs(ms)} · #${idx + 1} · row ${snap.row}/${snap.layout.totalRows} · measure ${measure} · beat ${beat}`
      } else {
        status.textContent = ''
      }
    }

    if (col < 0 || col >= cols) { hl.style.display = 'none'; return }
    // Подсветка повторяет зону клика: квадрат вокруг ближайшей линии (в плотных
    // блоках = полная ячейка rh, в редких = cw×cw), скрыт в мёртвой зоне.
    const hit = hitLine(chartY, blockLayouts, cw)
    if (!hit) { hl.style.display = 'none'; return }
    const half = hitHalf(hit.layout.rh, cw)
    hl.style.display = 'block'
    hl.style.left = `${col * cw}px`
    hl.style.top = `${hit.lineY - half}px`
    hl.style.width = `${cw}px`
    hl.style.height = `${half * 2}px`
  }

  const handleMouseLeave = () => {
    if (highlightRef.current) highlightRef.current.style.display = 'none'
    if (statusRef.current) statusRef.current.textContent = ''
  }

  const blocks = useMemo(() => blockLayouts.map(l => l.block), [blockLayouts])
  usePlayback(blocks, blockLayouts, scrollRef, { contentRef, gridRef, playbackYRef })

  // Времена хитов для оверлея-счётчика — считаем только когда оверлей включён.
  const counterHitTimes = useMemo(
    () => (showNoteCounter ? computeHitTimes(blocks) : []),
    [showNoteCounter, blocks],
  )

  // Ручной скролл/скраб → синхронизируем currentTime. Во время playback вертикальный
  // скролл заблокирован (overflowY:hidden), так что сюда долетают только ручные
  // скроллы на паузе; isPlaying-гард — страховка от остаточных событий.
  const handleScroll = (newScrollTop: number) => {
    if (isPlaying) return
    const offsets = computeBlockOffsets(blocks)
    setCurrentTime(scrollYToMs(newScrollTop, offsets, blockLayouts))
  }

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview, tapPreview } =
    useEditor(blockLayouts, scrollRef, activeTabId, cols, cw, cursorY, scrollOffset)

  // Превью растягивающегося холда (синтетическая нота на каждый затронутый блок,
  // включая кросс-блочные части) и/или Alt+drag серии тапов. Не зависит от scroll.
  const previewNotesByBlock = useMemo(() => {
    if (!preview && !tapPreview) return null
    const result = new Map<string, Note[]>()
    if (preview) {
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
        result.set(layout.block.id, [note])
      }
    }
    if (tapPreview) {
      tapPreview.rowsByBlock.forEach((rows, blockId) => {
        const taps: Note[] = rows.map(row => ({ row, col: tapPreview.col, type: 'tap' }))
        result.set(blockId, [...(result.get(blockId) ?? []), ...taps])
      })
    }
    return result
  }, [preview, tapPreview, blockLayouts])

  if (!activeTab) return null

  const totalHeight =
    blockLayouts.length > 0
      ? blockLayouts[blockLayouts.length - 1].endY + BLOCK_DIVIDER_HEIGHT
      : 0

  const notesWidth = cols * cw

  const openBlockIndex = openBlockId
    ? blockLayouts.findIndex(l => l.block.id === openBlockId)
    : -1

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {showNoteCounter && <NoteCounterOverlay hitTimes={counterHitTimes} width={notesWidth} />}
      <div className="flex shrink-0">
        <ColumnHeaders cols={cols} cw={cw} />
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
        <Cursor cursorY={cursorY} />
        <div style={{ height: cursorY, flexShrink: 0 }} />
        <div ref={contentRef} style={{ position: 'relative', height: totalHeight, width: notesWidth + RAIL_WIDTH }}>
          {railColoring !== 'none' && (
            <div className="absolute left-0 top-0 pointer-events-none" style={{ width: notesWidth, height: totalHeight }}>
              {blockLayouts.map(({ block, startY, endY }, i) => {
                const tint = sectionTint(railColoring, i)
                if (!tint) return null
                return (
                  <div
                    key={block.id}
                    className="absolute left-0"
                    style={{ top: startY, height: endY - startY, width: notesWidth, backgroundColor: tint }}
                  />
                )
              })}
            </div>
          )}
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
                cw={cw}
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
                width: cw,
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
                cw={cw}
                totalRows={totalRows}
                height={endY - startY}
                notesWidth={notesWidth}
                previewNotes={previewNotesByBlock?.get(block.id) ?? null}
              />
            ))}
          </div>
          {selectionRect && (
            <div
              data-testid="selection-overlay"
              className="absolute pointer-events-none border-y border-primary/60 bg-primary/15"
              style={{ left: 0, width: notesWidth, top: selectionRect.top, height: selectionRect.height, zIndex: 3 }}
            />
          )}
          <BlockRail
            blockLayouts={blockLayouts}
            totalHeight={totalHeight}
            openBlockId={openBlockId}
            selectedBlockId={selection?.kind === 'block' ? selection.blockId : null}
            railColoring={railColoring}
            onBlockClick={handleRailBlockClick}
            onBlockShiftClick={handleRailBlockShiftClick}
            onAddBlock={stableAddBlock}
          />
          {/* Полоски resize на нижних границах блоков (поверх рельсы) */}
          {!isPlaying && blockLayouts.map(({ block, startY, endY, rh }) => (
            <div
              key={`rs-${block.id}`}
              data-testid="block-resize-handle"
              className="absolute"
              style={{ left: notesWidth, width: RAIL_WIDTH, top: endY - 4, height: 8, cursor: 'row-resize', zIndex: 11, touchAction: 'none' }}
              title="Drag to resize block"
              onPointerDown={e => onResizeDown(e, block.id, startY, rh)}
              onPointerMove={onResizeMove}
              onPointerUp={onResizeUp}
              onPointerCancel={onResizeCancel}
            />
          ))}
          {resizeGhost && (
            <div
              className="absolute pointer-events-none border-t-2 border-dashed border-primary"
              style={{ left: 0, width: notesWidth + RAIL_WIDTH, top: resizeGhost.y, zIndex: 12 }}
            >
              <span className="absolute right-1 top-0.5 text-[10px] font-mono text-primary bg-card/80 px-1 rounded">
                {resizeGhost.rows} rows
              </span>
            </div>
          )}
        </div>
        <div style={{ height: Math.max(0, containerH - cursorY), flexShrink: 0 }} />
      </div>
      <div
        ref={statusRef}
        data-testid="status-bar"
        className="shrink-0 h-5 px-2 flex items-center text-[10px] font-mono text-muted-foreground border-t border-border bg-card whitespace-nowrap overflow-hidden tabular-nums"
      />
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
