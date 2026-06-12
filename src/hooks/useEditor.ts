import { useRef, useState, useCallback } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { COLUMN_WIDTH, CURSOR_LINE_Y, blockRowCount } from '@/utils/geometry'
import type { BlockLayout } from '@/utils/geometry'
import type { Note, Block } from '@/types/chart'

export interface HoldPreview {
  col: number
  startBlockId: string
  startRow: number
  endBlockId: string
  endRow: number
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

// Collect all block-parts of a cross-block hold chain containing (blocks[anyIdx], col)
function collectHoldChain(blocks: Block[], anyIdx: number, col: number): { idx: number; note: Note }[] {
  const anyNote = blocks[anyIdx]?.notes.find(n => n.col === col && n.type === 'hold')
  if (!anyNote) return []

  // Walk backward to find the true chain start
  let startIdx = anyIdx
  if (anyNote.continued) {
    for (let i = anyIdx - 1; i >= 0; i--) {
      const n = blocks[i].notes.find(n => n.col === col && n.type === 'hold' && n.continues)
      if (!n) break
      startIdx = i
      if (!n.continued) break
    }
  }

  // Walk forward collecting each part
  const chain: { idx: number; note: Note }[] = []
  for (let i = startIdx; i < blocks.length; i++) {
    const n = blocks[i].notes.find(n => {
      if (n.col !== col || n.type !== 'hold') return false
      return i === startIdx ? !n.continued : !!n.continued
    })
    if (!n) break
    chain.push({ idx: i, note: n })
    if (!n.continues) break
  }
  return chain
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
      endBlockId: layout.block.id,
      endRow: row,
      startedOnNote: onNote,
      draggedUp: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [hitTest])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.startedOnNote) return

    const el = scrollRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const py = e.clientY - rect.top + el.scrollTop - CURSOR_LINE_Y

    const startLayout = blockLayouts.find(l => l.block.id === drag.blockId)
    if (!startLayout) return

    const startAbsY = startLayout.startY + drag.startRow * startLayout.rh

    if (py < startAbsY) {
      dragRef.current = { ...drag, draggedUp: true }
      setPreview(null)
      return
    }

    // Find which block the mouse is in
    let endLayout: BlockLayout | null = null
    let endRow = 0
    for (const layout of blockLayouts) {
      if (py < layout.startY) break
      const row = Math.min(layout.totalRows - 1, Math.max(0, Math.floor((py - layout.startY) / layout.rh)))
      endLayout = layout
      endRow = row
      if (py < layout.endY) break
    }

    if (!endLayout) {
      dragRef.current = { ...drag, draggedUp: true }
      setPreview(null)
      return
    }

    const startIdx = blockLayouts.indexOf(startLayout)
    const endIdx = blockLayouts.indexOf(endLayout)
    const isSameBlock = endLayout.block.id === drag.blockId
    const hasExtent = !isSameBlock || endRow > drag.startRow

    dragRef.current = { ...drag, draggedUp: false, endBlockId: endLayout.block.id, endRow }

    if (hasExtent) {
      setPreview({ col: drag.col, startBlockId: drag.blockId, startRow: drag.startRow, endBlockId: endLayout.block.id, endRow })
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
    const { blockId, col, startRow, endBlockId, endRow, startedOnNote } = drag

    const startBlock = chart.blocks.find(b => b.id === blockId)
    if (!startBlock) return

    // Delete: click on existing note without moving
    if (startedOnNote && endBlockId === blockId && endRow === startRow) {
      const clickedBlockIdx = chart.blocks.findIndex(b => b.id === blockId)
      const clickedNote = startBlock.notes.find(n => {
        if (n.col !== col) return false
        if (n.type === 'tap') return n.row === startRow
        const end = n.endRow ?? n.row
        return n.row <= startRow && startRow <= end
      })

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
        const notes = startBlock.notes.filter(n => {
          if (n.col !== col) return true
          if (n.type === 'tap') return n.row !== startRow
          const end = n.endRow ?? n.row
          return !(n.row <= startRow && startRow <= end)
        })
        const blocks = chart.blocks.map(b => b.id === blockId ? { ...b, notes } : b)
        updateChart(activeTabId, { ...chart, blocks })
      }
      return
    }

    if (startedOnNote) return
    if (drag.draggedUp) return

    const startBlockIdx = chart.blocks.findIndex(b => b.id === blockId)
    const endBlockIdx = chart.blocks.findIndex(b => b.id === endBlockId)

    if (startBlockIdx === endBlockIdx) {
      // Single block
      const filtered = startBlock.notes.filter(n => {
        if (n.col !== col) return true
        if (n.type === 'tap') return n.row < startRow || n.row > endRow
        const end = n.endRow ?? n.row
        return end < startRow || n.row > endRow
      })
      const newNote: Note = endRow === startRow
        ? { row: startRow, col, type: 'tap' }
        : { row: startRow, col, type: 'hold', endRow }
      const blocks = chart.blocks.map(b => b.id === blockId ? { ...b, notes: [...filtered, newNote] } : b)
      updateChart(activeTabId, { ...chart, blocks })
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

      const filtered = b.notes.filter(n => {
        if (n.col !== col) return true
        if (n.type === 'tap') return n.row < clearFrom || n.row > clearTo
        const end = n.endRow ?? n.row
        return end < clearFrom || n.row > clearTo
      })

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

    updateChart(activeTabId, { ...chart, blocks: newBlocks })
  }, [activeTab, activeTabId, updateChart, blockLayouts])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    commit()
  }, [commit])

  const onPointerCancel = useCallback(() => {
    dragRef.current = null
    setPreview(null)
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, preview }
}
