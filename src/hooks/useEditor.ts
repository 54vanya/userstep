import { useRef, useState, useCallback } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { COLUMN_WIDTH, CURSOR_LINE_Y } from '@/utils/geometry'
import type { BlockLayout } from '@/utils/geometry'
import type { Note, Block } from '@/types/chart'

export interface HoldPreview {
  blockId: string
  col: number
  startRow: number
  endRow: number
}

interface DragState {
  blockId: string
  col: number
  startRow: number
  currentRow: number
  startedOnNote: boolean
  draggedUp: boolean
}

function isNoteOccupied(block: Block, row: number, col: number): boolean {
  return block.notes.some(n => {
    if (n.col !== col) return false
    if (n.type === 'tap') return n.row === row
    const endRow = n.endRow ?? n.row
    return n.row <= row && row <= endRow
  })
}

export function useEditor(
  blockLayouts: BlockLayout[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  activeTabId: string | null,
  cols: number,
) {
  const { tabs, updateChart } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const dragRef = useRef<DragState | null>(null)
  const [preview, setPreview] = useState<HoldPreview | null>(null)

  const hitTest = useCallback((clientX: number, clientY: number) => {
    const el = scrollRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top + el.scrollTop - CURSOR_LINE_Y

    const col = Math.floor(px / COLUMN_WIDTH)
    if (col < 0 || col >= cols) return null

    for (const layout of blockLayouts) {
      if (py >= layout.startY && py < layout.endY) {
        const row = Math.floor((py - layout.startY) / layout.rh)
        if (row >= 0 && row < layout.totalRows) {
          return { layout, row, col }
        }
      }
    }
    return null
  }, [blockLayouts, scrollRef, cols])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const hit = hitTest(e.clientX, e.clientY)
    if (!hit) return

    const { layout, row, col } = hit
    const onNote = isNoteOccupied(layout.block, row, col)
    dragRef.current = {
      blockId: layout.block.id,
      col,
      startRow: row,
      currentRow: row,
      startedOnNote: onNote,
      draggedUp: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [hitTest])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return

    const el = scrollRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const py = e.clientY - rect.top + el.scrollTop - CURSOR_LINE_Y

    const layout = blockLayouts.find(l => l.block.id === drag.blockId)
    if (!layout) return

    const rawRow = Math.floor((py - layout.startY) / layout.rh)
    const draggedUp = !drag.startedOnNote && rawRow < drag.startRow
    const newRow = Math.max(drag.startRow, Math.min(layout.totalRows - 1, rawRow))

    dragRef.current = { ...drag, currentRow: newRow, draggedUp }

    if (!drag.startedOnNote && newRow > drag.startRow) {
      setPreview({ blockId: drag.blockId, col: drag.col, startRow: drag.startRow, endRow: newRow })
    } else {
      setPreview(null)
    }
  }, [blockLayouts, scrollRef])

  const commit = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    setPreview(null)

    if (!drag || !activeTab || !activeTabId) return

    const chart = activeTab.chart
    const block = chart.blocks.find(b => b.id === drag.blockId)
    if (!block) return

    const { blockId, col, startRow, currentRow, startedOnNote } = drag

    if (startedOnNote && currentRow === startRow) {
      // Delete: remove the note whose range covers startRow
      const notes = block.notes.filter(n => {
        if (n.col !== col) return true
        if (n.type === 'tap') return n.row !== startRow
        const endRow = n.endRow ?? n.row
        return !(n.row <= startRow && startRow <= endRow)
      })
      const blocks = chart.blocks.map(b => b.id === blockId ? { ...b, notes } : b)
      updateChart(activeTabId, { ...chart, blocks })
      return
    }

    // If drag started on existing note but was dragged — ignore (no-op)
    if (startedOnNote) return

    // User dragged upward from empty cell — treat as cancellation
    if (drag.draggedUp) return

    // Clear any notes overlapping the new note's column range
    const filtered = block.notes.filter(n => {
      if (n.col !== col) return true
      if (n.type === 'tap') return n.row < startRow || n.row > currentRow
      const endRow = n.endRow ?? n.row
      return endRow < startRow || n.row > currentRow
    })

    const newNote: Note =
      currentRow === startRow
        ? { row: startRow, col, type: 'tap' }
        : { row: startRow, col, type: 'hold', endRow: currentRow }

    const blocks = chart.blocks.map(b =>
      b.id === blockId ? { ...b, notes: [...filtered, newNote] } : b
    )
    updateChart(activeTabId, { ...chart, blocks })
  }, [activeTab, activeTabId, updateChart])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    commit()
  }, [commit])

  const onPointerCancel = useCallback(() => {
    dragRef.current = null
    setPreview(null)
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview }
}
