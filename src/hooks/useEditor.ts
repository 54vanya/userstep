import { useRef, useState, useCallback } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { blockRowCount, hitLine, snapRow } from '@/utils/geometry'
import type { BlockLayout } from '@/utils/geometry'
import { clearColumnSpan, collectHoldChain, noteEnd, sanitizeHoldFlags } from '@/utils/holds'
import type { Note, Block } from '@/types/chart'

export interface HoldPreview {
  col: number
  startBlockId: string
  startRow: number
  endBlockId: string
  endRow: number
}

// Alt+drag — «рисование» серии тапов (StepEdit Lite): tap на каждой строке,
// через которую прошла мышь. rowsByBlock мутируется по ходу drag'а.
export interface TapSeries {
  col: number
  rowsByBlock: Map<string, Set<number>>
  last: { blockId: string; row: number }
}

interface DragState {
  blockId: string
  col: number
  startRow: number
  endBlockId: string
  endRow: number
  startedOnNote: boolean
  draggedUp: boolean
}

function isNoteOccupied(block: Block, row: number, col: number): boolean {
  return block.notes.some(n => n.col === col && n.row <= row && row <= noteEnd(n))
}

export function useEditor(
  blockLayouts: BlockLayout[],
  activeTabId: string | null,
  cols: number,
  // Эффективная ширина колонки (зависит от зума поля).
  cw: number,
  // Единая конверсия экран → координаты чарта (ChartGrid.toChartPoint):
  // учитывает курсор и живую playback-позицию, иначе hit-test промахивается.
  toChartPoint: (clientX: number, clientY: number) => { px: number; py: number } | null,
) {
  const { tabs, updateChart } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const dragRef = useRef<DragState | null>(null)
  const [preview, setPreview] = useState<HoldPreview | null>(null)
  // Якорь Shift+drag выделения: строка, от которой тянется диапазон (в пределах
  // одного блока — выделение у нас per-block, как per-range у StepEdit Lite).
  const selAnchorRef = useRef<{ blockId: string; row: number } | null>(null)
  // Alt+drag серия тапов: копится в ref, в стейт кладётся снимок для предпросмотра,
  // коммит одним updateChart на pointerup (один undo-снэпшот).
  const tapSeriesRef = useRef<TapSeries | null>(null)
  const [tapPreview, setTapPreview] = useState<{ col: number; rowsByBlock: Map<string, number[]> } | null>(null)

  const snapshotTapPreview = useCallback(() => {
    const s = tapSeriesRef.current
    if (!s) return
    const rowsByBlock = new Map<string, number[]>()
    s.rowsByBlock.forEach((set, id) => rowsByBlock.set(id, [...set]))
    setTapPreview({ col: s.col, rowsByBlock })
  }, [])

  const hitTest = useCallback((clientX: number, clientY: number) => {
    const pt = toChartPoint(clientX, clientY)
    if (!pt) return null

    const col = Math.floor(pt.px / cw)
    if (col < 0 || col >= cols) return null

    // Хит-позиция — линия; зона регистрации — квадрат вокруг неё (мёртвые зоны
    // между линиями на редких блоках → hit === null).
    const hit = hitLine(pt.py, blockLayouts, cw)
    if (!hit) return null
    return { layout: hit.layout, row: hit.row, col }
  }, [blockLayouts, cols, cw, toChartPoint])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return

    // Shift+клик / Shift+drag — выделение диапазона строк (снэп на ближайшую
    // линию без мёртвых зон). Повторный Shift+клик в том же блоке расширяет
    // существующий диапазон до кликнутой строки.
    if (e.shiftKey) {
      const pt = toChartPoint(e.clientX, e.clientY)
      if (!pt) return
      const snap = snapRow(pt.py, blockLayouts)
      if (!snap) return
      const { selection, setSelection } = useEditorStore.getState()
      const blockId = snap.layout.block.id
      if (selection?.kind === 'rows' && selection.blockId === blockId) {
        setSelection({
          kind: 'rows',
          blockId,
          fromRow: Math.min(selection.fromRow, snap.row),
          toRow: Math.max(selection.toRow, snap.row),
        })
      } else {
        setSelection({ kind: 'rows', blockId, fromRow: snap.row, toRow: snap.row })
      }
      selAnchorRef.current = { blockId, row: snap.row }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }

    // Alt+клик / Alt+drag — серия тапов (StepEdit Lite): tap на каждой строке,
    // через которую прошла мышь; колонка фиксируется стартовой.
    if (e.altKey) {
      const pt = toChartPoint(e.clientX, e.clientY)
      if (!pt) return
      const col = Math.floor(pt.px / cw)
      if (col < 0 || col >= cols) return
      const snap = snapRow(pt.py, blockLayouts)
      if (!snap) return
      const blockId = snap.layout.block.id
      tapSeriesRef.current = {
        col,
        rowsByBlock: new Map([[blockId, new Set([snap.row])]]),
        last: { blockId, row: snap.row },
      }
      snapshotTapPreview()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }

    // Обычный клик снимает выделение (как в StepEdit Lite; Esc — тоже).
    const ed = useEditorStore.getState()
    if (ed.selection) ed.setSelection(null)

    const hit = hitTest(e.clientX, e.clientY)
    if (!hit) return

    const { layout, row, col } = hit
    const onNote = isNoteOccupied(layout.block, row, col)
    dragRef.current = {
      blockId: layout.block.id,
      col,
      startRow: row,
      endBlockId: layout.block.id,
      endRow: row,
      startedOnNote: onNote,
      draggedUp: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [hitTest, toChartPoint, blockLayouts, cols, cw, snapshotTapPreview])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    // Серия тапов: добавляем каждую строку между прошлой и текущей позицией
    // (быстрая мышь перескакивает строки — интерполируем внутри блока).
    const series = tapSeriesRef.current
    if (series) {
      const pt = toChartPoint(e.clientX, e.clientY)
      if (!pt) return
      const snap = snapRow(pt.py, blockLayouts)
      if (!snap) return
      const blockId = snap.layout.block.id
      if (!series.rowsByBlock.has(blockId)) series.rowsByBlock.set(blockId, new Set())
      const set = series.rowsByBlock.get(blockId)!
      if (series.last.blockId === blockId) {
        const from = Math.min(series.last.row, snap.row)
        const to = Math.max(series.last.row, snap.row)
        for (let r = from; r <= to; r++) set.add(r)
      } else {
        set.add(snap.row)
      }
      series.last = { blockId, row: snap.row }
      snapshotTapPreview()
      return
    }

    // Растягивание выделения: диапазон между якорем и текущей строкой, зажатый
    // в блок якоря (кросс-блочного выделения нет — у блоков разные split).
    const anchor = selAnchorRef.current
    if (anchor) {
      const pt = toChartPoint(e.clientX, e.clientY)
      if (!pt) return
      const layout = blockLayouts.find(l => l.block.id === anchor.blockId)
      if (!layout) return
      const rel = Math.round((pt.py - layout.startY) / layout.rh)
      const row = Math.min(layout.totalRows - 1, Math.max(0, rel))
      useEditorStore.getState().setSelection({
        kind: 'rows',
        blockId: anchor.blockId,
        fromRow: Math.min(anchor.row, row),
        toRow: Math.max(anchor.row, row),
      })
      return
    }

    const drag = dragRef.current
    if (!drag || drag.startedOnNote) return

    const pt = toChartPoint(e.clientX, e.clientY)
    if (!pt) return

    const startLayout = blockLayouts.find(l => l.block.id === drag.blockId)
    if (!startLayout) return

    const startAbsY = startLayout.startY + drag.startRow * startLayout.rh

    if (pt.py < startAbsY) {
      dragRef.current = { ...drag, draggedUp: true }
      setPreview(null)
      return
    }

    // Конец холда привязываем к ближайшей линии (без мёртвых зон).
    const snap = snapRow(pt.py, blockLayouts)
    if (!snap) {
      dragRef.current = { ...drag, draggedUp: true }
      setPreview(null)
      return
    }
    const endLayout = snap.layout
    const endRow = snap.row

    const isSameBlock = endLayout.block.id === drag.blockId
    const hasExtent = !isSameBlock || endRow > drag.startRow

    dragRef.current = { ...drag, draggedUp: false, endBlockId: endLayout.block.id, endRow }

    if (hasExtent) {
      setPreview({ col: drag.col, startBlockId: drag.blockId, startRow: drag.startRow, endBlockId: endLayout.block.id, endRow })
    } else {
      setPreview(null)
    }
  }, [blockLayouts, toChartPoint, snapshotTapPreview])

  // Коммит серии тапов одним updateChart: существующие ноты в закрашенных
  // ячейках колонки замещаются, задетые холды удаляются (их части в этом блоке).
  const commitTapSeries = useCallback(() => {
    const s = tapSeriesRef.current
    tapSeriesRef.current = null
    setTapPreview(null)
    if (!s || !activeTab || !activeTabId) return
    const blocks = activeTab.chart.blocks.map(b => {
      const set = s.rowsByBlock.get(b.id)
      if (!set || set.size === 0) return b
      const filtered = b.notes.filter(n => {
        if (n.col !== s.col) return true
        for (let r = n.row; r <= noteEnd(n); r++) if (set.has(r)) return false
        return true
      })
      const taps: Note[] = [...set].sort((a, b2) => a - b2).map(row => ({ row, col: s.col, type: 'tap' }))
      return { ...b, notes: [...filtered, ...taps] }
    })
    updateChart(activeTabId, { ...activeTab.chart, blocks: sanitizeHoldFlags(blocks) })
  }, [activeTab, activeTabId, updateChart])

  const commit = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    setPreview(null)

    if (!drag || !activeTab || !activeTabId) return

    const chart = activeTab.chart
    const { blockId, col, startRow, endBlockId, endRow, startedOnNote } = drag

    const startBlock = chart.blocks.find(b => b.id === blockId)
    if (!startBlock) return

    // Delete: click on existing note without moving
    if (startedOnNote && endBlockId === blockId && endRow === startRow) {
      const clickedBlockIdx = chart.blocks.findIndex(b => b.id === blockId)
      const clickedNote = startBlock.notes.find(n =>
        n.col === col && n.row <= startRow && startRow <= noteEnd(n))

      if (clickedNote?.type === 'hold' && (clickedNote.continues || clickedNote.continued)) {
        // Cross-block hold: delete all parts in the chain
        const chain = collectHoldChain(chart.blocks, clickedBlockIdx, col)
        const chainMap = new Map(chain.map(c => [c.idx, c.note]))
        const blocks = chart.blocks.map((b, i) => {
          const noteToRemove = chainMap.get(i)
          if (!noteToRemove) return b
          return { ...b, notes: b.notes.filter(n => n !== noteToRemove) }
        })
        updateChart(activeTabId, { ...chart, blocks })
      } else {
        const notes = clearColumnSpan(startBlock.notes, col, startRow, startRow)
        const blocks = chart.blocks.map(b => b.id === blockId ? { ...b, notes } : b)
        updateChart(activeTabId, { ...chart, blocks: sanitizeHoldFlags(blocks) })
      }
      return
    }

    if (startedOnNote) return
    if (drag.draggedUp) return

    const startBlockIdx = chart.blocks.findIndex(b => b.id === blockId)
    const endBlockIdx = chart.blocks.findIndex(b => b.id === endBlockId)

    if (startBlockIdx === endBlockIdx) {
      // Single block. Замещённая нота могла быть частью кросс-блочной цепочки —
      // sanitizeHoldFlags снимает висячие флаги у соседей.
      const filtered = clearColumnSpan(startBlock.notes, col, startRow, endRow)
      const newNote: Note = endRow === startRow
        ? { row: startRow, col, type: 'tap' }
        : { row: startRow, col, type: 'hold', endRow }
      const blocks = chart.blocks.map(b => b.id === blockId ? { ...b, notes: [...filtered, newNote] } : b)
      updateChart(activeTabId, { ...chart, blocks: sanitizeHoldFlags(blocks) })
      return
    }

    // Cross-block hold
    const newBlocks = chart.blocks.map((b, i) => {
      if (i < startBlockIdx || i > endBlockIdx) return b

      const totalRows = blockRowCount(b)
      const isFirst = i === startBlockIdx
      const isLast = i === endBlockIdx
      const clearFrom = isFirst ? startRow : 0
      const clearTo = isLast ? endRow : totalRows - 1

      const filtered = clearColumnSpan(b.notes, col, clearFrom, clearTo)

      let newNote: Note
      if (isFirst) {
        newNote = { row: startRow, col, type: 'hold', endRow: totalRows - 1, continues: true }
      } else if (isLast) {
        newNote = { row: 0, col, type: 'hold', endRow, continued: true }
      } else {
        newNote = { row: 0, col, type: 'hold', endRow: totalRows - 1, continued: true, continues: true }
      }

      return { ...b, notes: [...filtered, newNote] }
    })

    // Расчистка колонки могла задеть чужие цепочки за пределами нового холда.
    updateChart(activeTabId, { ...chart, blocks: sanitizeHoldFlags(newBlocks) })
  }, [activeTab, activeTabId, updateChart, blockLayouts])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    if (tapSeriesRef.current) {
      commitTapSeries()
      return
    }
    if (selAnchorRef.current) {
      selAnchorRef.current = null
      return
    }
    commit()
  }, [commit, commitTapSeries])

  const onPointerCancel = useCallback(() => {
    selAnchorRef.current = null
    tapSeriesRef.current = null
    setTapPreview(null)
    dragRef.current = null
    setPreview(null)
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview, tapPreview }
}
