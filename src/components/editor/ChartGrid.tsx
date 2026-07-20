import { useRef, useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import {
  rowHeight,
  blockCells,
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
import type { BlockLayout } from '@/utils/geometry'
import { useChart } from '@/hooks/useChart'
import { useEditor } from '@/hooks/useEditor'
import { usePlayback } from '@/hooks/usePlayback'
import { computeBlockOffsets, msToScrollY, scrollYToMs, formatMs } from '@/utils/timing'
import { BlockRail } from './BlockRail'
import { BlockSettingsPopup, BLOCK_POPUP_WIDTH } from './BlockSettingsPopup'
import { BlockLayer } from './BlockLayer'
import { GridBlock } from './GridLayer'
import { Cursor } from './Cursor'
import { NoteCounterOverlay } from './NoteCounterOverlay'
import { computeHitTimes } from '@/utils/noteCount'
import { sectionTint } from '@/utils/viewSettings'
import type { Note } from '@/types/chart'
import { chartCols } from '@/types/chart'

export function ChartGrid() {
  const { tabs, activeTabId } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const fieldZoom = useEditorStore(s => s.fieldZoom)
  // Зум поля — равномерный множитель: per-tab scale (расстояние строк) тоже на него
  // умножается, чтобы поле росло целиком, а не только ноты/колонки.
  const scale = (activeTab?.scale ?? 3) * (fieldZoom / 100)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerH, setContainerH] = useState(600)
  const [containerW, setContainerW] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setContainerH(el.clientHeight)
    setContainerW(el.clientWidth)
    const ro = new ResizeObserver(() => {
      setContainerH(el.clientHeight)
      setContainerW(el.clientWidth)
    })
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

  const cols = chartCols(activeTab.chart)

  return (
    <ChartGridInner
      blockLayouts={blockLayouts}
      scrollRef={scrollRef}
      containerH={containerH}
      containerW={containerW}
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
  containerW: number
  cols: number
  scale: number
  activeTabId: string | null
}

function ChartGridInner({
  blockLayouts,
  scrollRef,
  containerH,
  containerW,
  cols,
  scale,
  activeTabId,
}: InnerProps) {
  const { tabs } = useTabsStore()
  // Подписки — по-полевые: подписка на весь стор ререндерила бы самый тяжёлый
  // компонент дерева на каждый тик currentTime при скролле/скрабе. currentTime
  // в рендере не нужен — обработчики читают его через getState().
  const isPlaying = useEditorStore(s => s.isPlaying)
  const setCurrentTime = useEditorStore(s => s.setCurrentTime)
  const showColumnDividers = useEditorStore(s => s.showColumnDividers)
  const showRowLines = useEditorStore(s => s.showRowLines)
  const fieldZoom = useEditorStore(s => s.fieldZoom)
  const showNoteCounter = useEditorStore(s => s.showNoteCounter)
  const fieldAlign = useEditorStore(s => s.fieldAlign)
  const railColoring = useEditorStore(s => s.railColoring)
  const selection = useEditorStore(s => s.selection)
  const setSelection = useEditorStore(s => s.setSelection)
  // Зум поля: ноты/колонки и хит-линия растут пропорционально (per-tab scale при этом
  // отвечает лишь за расстояние между строками).
  const cw = (COLUMN_WIDTH * fieldZoom) / 100
  const cursorY = (CURSOR_LINE_Y * fieldZoom) / 100
  // Горизонтальный сдвиг поля при выравнивании по центру: свободное место вьюпорта
  // делится пополам (когда поле шире вьюпорта — 0, поведение как при left).
  // Сдвигается content-слой, заголовки колонок, комбо-оверлей; хит-тесты и попап
  // блока учитывают его же.
  const fieldOffsetX =
    fieldAlign === 'center' ? Math.max(0, Math.floor((containerW - (cols * cw + RAIL_WIDTH)) / 2)) : 0
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
    const pt = toChartPoint(e.clientX, e.clientY)
    if (!r || !pt) return
    const rows = Math.max(1, Math.round((pt.py - r.startY) / r.rh))
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
    const railRight = rect.left + fieldOffsetX + cols * cw + RAIL_WIDTH - scrollEl.scrollLeft
    let left = railRight + 8
    if (left + BLOCK_POPUP_WIDTH > window.innerWidth - 8) {
      left = railRight - BLOCK_POPUP_WIDTH - 8
    }
    setPopupPos({ top: blockScreenTop, left: Math.max(8, left), editorTop: rect.top, editorBottom: rect.bottom })
  }, [openBlockId, blockLayouts, scrollRef, cols, cw, cursorY, fieldOffsetX])

  // Оффсеты блоков — один раз на изменение чарта/масштаба: их пересчёт на каждый
  // mousemove/scroll аллоцировал массив по всем блокам ради одного элемента.
  const blocks = useMemo(() => blockLayouts.map(l => l.block), [blockLayouts])
  const blockOffsets = useMemo(() => computeBlockOffsets(blocks), [blocks])

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
    const y = msToScrollY(useEditorStore.getState().currentTime, blockOffsets, blockLayouts)
    scrollRef.current.scrollTop = y
    // Чтобы возможный cleanup playback-цикла не вернул scrollTop на позицию
    // прошлой вкладки — синхронизируем якорь.
    playbackYRef.current = y
  }, [activeTab?.chart.id, activeTabId, blockLayouts, blockOffsets])

  const isPlayingRef = useRef(isPlaying)
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // Эффективный скролл-офсет для перевода экранных координат в координаты чарта:
  // при playback — живая позиция воспроизведения, иначе — нативный scrollTop.
  const scrollOffset = useCallback(
    () => (isPlayingRef.current ? playbackYRef.current : scrollRef.current?.scrollTop ?? 0),
    [scrollRef],
  )

  // ЕДИНСТВЕННАЯ формула экран → координаты чарта (px — внутри поля, py — по
  // вертикали с учётом курсора и playback-позиции). Все хит-тесты, выделение,
  // статус-бар и resize обязаны ходить через неё.
  const toChartPoint = useCallback((clientX: number, clientY: number) => {
    const el = scrollRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      px: clientX - rect.left - fieldOffsetX,
      py: clientY - rect.top + scrollOffset() - cursorY,
    }
  }, [scrollRef, scrollOffset, cursorY, fieldOffsetX])

  // Ctrl+колесо — per-tab Scale (расстояние между строками; setTabScale клампит
  // в MIN..MAX, позицию сохраняет пропорциональный пересчёт scrollTop ниже).
  // Нужен нативный non-passive listener: React вешает onWheel пассивно,
  // preventDefault не сработал бы и браузер зумил бы страницу целиком.
  // Шаги копятся и применяются раз в кадр (rAF): трекпад шлёт wheel чаще 60 Гц,
  // без коалессинга каждый ивент дёргал бы стор и рендер по нескольку раз за кадр.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let pendingSteps = 0
    let rafId = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      pendingSteps += e.deltaY < 0 ? 0.5 : -0.5
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const steps = pendingSteps
        pendingSteps = 0
        const { tabs, activeTabId, setTabScale } = useTabsStore.getState()
        const tab = tabs.find(t => t.id === activeTabId)
        if (tab) setTabScale(tab.id, tab.scale + steps)
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scrollRef])

  // Клавиатурная навигация (как в StepEdit Lite): ↑/↓ — строка, PgUp/PgDn —
  // страница, Home/End — начало/конец. Во время playback скролл заблокирован.
  // INPUT/SELECT/TEXTAREA пропускаем целиком: range-слайдеры сами ходят стрелками.
  // Слушатель регистрируется ОДИН раз, layouts/offsets читаются через ref: если бы
  // deps включали их, каждый updateChart пере-регистрировал бы слушатель, а React
  // флашит эффекты в микротаске МЕЖДУ слушателями одного keydown — снятый посреди
  // диспатча слушатель по DOM-спеке пропускает событие. Так терялся каждый шаг
  // навигации во время клавиатурного растягивания холда (курсор отставал от ноты).
  const navDataRef = useRef({ blockLayouts, blockOffsets })
  navDataRef.current = { blockLayouts, blockOffsets }
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (isTextEntry(target) || target.tagName === 'INPUT') return
      const el = scrollRef.current
      if (!el || isPlayingRef.current) return
      const { blockLayouts, blockOffsets } = navDataRef.current

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
      useEditorStore.getState().setCurrentTime(scrollYToMs(y, blockOffsets, blockLayouts))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [scrollRef])

  // Пересчёт scrollTop при смене scale. Чтение el.scrollTop здесь форсирует
  // reflow, но он НЕ лишний: запись scrollTop сама флашит layout (кламп по
  // scrollHeight), и это тот же recalc стилей, что всё равно нужен кадру перед
  // paint'ом — выносить базу в ref смысла нет, профиль это подтвердил.
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
    const hl = highlightRef.current
    if (!hl) return
    // Во время playback ховер не обновляем: поле летит под курсором (подсветка/статус
    // всё равно мгновенно устаревают), а главное — каждое обновление подсветки
    // инвалидировало бы тайлы слоя нот, что на плотных чартах при малом scale
    // (тысячи blend-спрайтов в тайле) роняет FPS при простом движении мыши.
    if (isPlayingRef.current) {
      if (hl.style.display !== 'none') handleMouseLeave()
      return
    }
    const pt = toChartPoint(e.clientX, e.clientY)
    if (!pt) return
    const col = Math.floor(pt.px / cw)

    // Статус-бар: ближайшая линия без мёртвых зон (snapRow), независимо от колонки.
    const status = statusRef.current
    if (status) {
      const snap = snapRow(pt.py, blockLayouts)
      if (snap) {
        const idx = blockLayouts.indexOf(snap.layout)
        const off = blockOffsets[idx]
        const b = snap.layout.block
        const cells = blockCells(b.beat, b.split)
        const measure = Math.floor(snap.row / cells) + 1
        const beat = Math.floor((snap.row % cells) / Math.max(1, b.split)) + 1
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
    const hit = hitLine(pt.py, blockLayouts, cw)
    if (!hit) { hl.style.display = 'none'; return }
    const half = hitHalf(hit.layout.rh, cw)
    hl.style.display = 'block'
    // Позиция — transform'ом: подсветка живёт на собственном композитном слое
    // (willChange), её движение не перерисовывает подлежащие ноты/сетку.
    hl.style.transform = `translate3d(${col * cw}px, ${hit.lineY - half}px, 0)`
    hl.style.width = `${cw}px`
    hl.style.height = `${half * 2}px`
  }

  const handleMouseLeave = () => {
    if (highlightRef.current) highlightRef.current.style.display = 'none'
    if (statusRef.current) statusRef.current.textContent = ''
  }

  usePlayback(blocks, blockLayouts, scrollRef, { contentRef, gridRef, playbackYRef })

  // Времена хитов для оверлея-счётчика — считаем только когда оверлей включён.
  const counterHitTimes = useMemo(
    () => (showNoteCounter ? computeHitTimes(blocks) : []),
    [showNoteCounter, blocks],
  )

  const { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, refreshSelectionDrag, preview, tapPreview } =
    useEditor(blockLayouts, activeTabId, cols, cw, toChartPoint)

  // Ручной скролл/скраб → синхронизируем currentTime. Во время playback вертикальный
  // скролл заблокирован (overflowY:hidden), так что сюда долетают только ручные
  // скроллы на паузе; isPlaying-гард — страховка от остаточных событий.
  // Скролл колесом во время Shift+drag дотягивает выделение за пределы вьюпорта.
  const handleScroll = (newScrollTop: number) => {
    if (isPlaying) return
    setCurrentTime(scrollYToMs(newScrollTop, blockOffsets, blockLayouts))
    refreshSelectionDrag()
  }

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
      {showNoteCounter && <NoteCounterOverlay hitTimes={counterHitTimes} width={notesWidth} left={fieldOffsetX} />}
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
        // Подстраховка от macOS-трекпада: клик-и-драг зажатым пальцем + скролл
        // ДРУГИМИ пальцами (жест авто-скролла во время Shift+drag) иногда
        // прерывает капчур указателя так, что ни pointerup, ни pointercancel до
        // страницы не долетают — dragRef/selAnchorRef подвисают навсегда, и
        // выделение перестаёт запускаться. lostpointercapture по спеке ВСЕГДА
        // срабатывает при любом снятии капчура (включая такие обрывы) — тем же
        // сбросом состояния, что и pointercancel, самоисцеляемся.
        onLostPointerCapture={onPointerCancel}
      >
        <Cursor cursorY={cursorY} />
        <div style={{ height: cursorY, flexShrink: 0 }} />
        <div ref={contentRef} style={{ position: 'relative', height: totalHeight, width: notesWidth + RAIL_WIDTH, marginLeft: fieldOffsetX }}>
          {/* Левая кромка поля при центрировании (справа её даёт border-l рельсы) */}
          {fieldOffsetX > 0 && (
            <div className="absolute top-0 border-l border-grid-beat pointer-events-none" style={{ left: 0, height: totalHeight }} />
          )}
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
                left: 0,
                top: 0,
                width: cw,
                pointerEvents: 'none',
                zIndex: 2,
                // Собственный слой: движение ховера не инвалидирует тайлы слоя нот
                // (при малом scale в один тайл попадают тысячи спрайтов с блендингом).
                willChange: 'transform',
              }}
            />
            {blockLayouts.map(({ block, startY, endY, rh, totalRows }) => (
              // Обёртка задаёт позицию блока и var(--rh) — все вертикальные
              // координаты спрайтов внутри считаются calc'ами от неё, поэтому
              // смена scale НЕ ре-рендерит BlockLayer (memo-хит: его пропы от
              // scale не зависят), браузер лишь пересчитывает стили.
              // zIndex:0 создаёт stacking context: «лесенка» z спрайтов по строкам
              // (стрелка нижней строки поверх верхней, как перекрывающиеся ноты в
              // игре) не выходит за пределы блока и не конкурирует с курсором/
              // оверлеями; сами блоки при равном z=0 укладываются в DOM-порядке.
              // content-visibility:auto — оффскрин-блоки не участвуют в пересчёте
              // стилей/лейауте (смена scale трогает только видимые; внутри блока
              // та же механика на сегментах ~64 нот — см. BlockLayer.SegmentSlot,
              // блочной гранулярности мало для чартов из одного огромного блока).
              // Обёртка растянута на max(cw, rh)/2 — максимальный выступ спрайта
              // за блок: ноты на крайних строках рисуются с translateY(-50%)
              // (спрайт basic высотой cw, плашка blocks высотой rh) — иначе paint
              // containment срезал бы эти выступы; внутренний слой возвращает
              // систему координат блока. При playback c-v остаётся: рендер
              // сегмента «на въезде» в вьюпорт дёшев, а прокси-margin браузера
              // прячет его за пределами экрана.
              <BlockSlot
                key={block.id}
                startY={startY}
                height={endY - startY}
                pad={Math.max(cw, rh) / 2}
                rh={rh}
                notesWidth={notesWidth}
              >
                <BlockLayer
                  block={block}
                  cw={cw}
                  totalRows={totalRows}
                  previewNotes={previewNotesByBlock?.get(block.id) ?? null}
                />
              </BlockSlot>
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

// Позиционирующая обёртка блока нот: несёт var(--rh), паддинг под выступы
// спрайтов и content-visibility для оффскрин-блоков (детали — у места
// использования в ChartGridInner). Внутренний слой восстанавливает координаты
// блока, чтобы BlockLayer ничего не знал про паддинг.
function BlockSlot({
  startY,
  height,
  pad,
  rh,
  notesWidth,
  children,
}: {
  startY: number
  height: number
  pad: number
  rh: number
  notesWidth: number
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute left-0"
      style={{
        top: startY - pad,
        width: notesWidth,
        height: height + pad * 2,
        zIndex: 0,
        '--rh': `${rh}px`,
        contentVisibility: 'auto',
      } as React.CSSProperties}
    >
      <div style={{ position: 'absolute', left: 0, top: pad, width: '100%', height }}>{children}</div>
    </div>
  )
}
