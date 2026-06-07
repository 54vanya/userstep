import { v4 as uuidv4 } from 'uuid'
import { useTabsStore } from '@/store/tabsStore'
import type { Note, Block } from '@/types/chart'

export function useChart() {
  const { tabs, activeTabId, updateChart } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const chart = activeTab?.chart ?? null

  const addNote = (blockId: string, note: Note) => {
    if (!chart || !activeTabId) return
    const blocks = chart.blocks.map(b => {
      if (b.id !== blockId) return b
      const filtered = b.notes.filter(n => !(n.row === note.row && n.col === note.col))
      return { ...b, notes: [...filtered, note] }
    })
    updateChart(activeTabId, { ...chart, blocks })
  }

  const removeNote = (blockId: string, row: number, col: number) => {
    if (!chart || !activeTabId) return
    const blocks = chart.blocks.map(b => {
      if (b.id !== blockId) return b
      const notes = b.notes.filter(n => {
        if (n.col !== col) return true
        if (n.type === 'tap') return n.row !== row
        const endRow = n.endRow ?? n.row
        return !(n.row <= row && row <= endRow)
      })
      return { ...b, notes }
    })
    updateChart(activeTabId, { ...chart, blocks })
  }

  const addBlock = () => {
    if (!chart || !activeTabId) return
    const last = chart.blocks[chart.blocks.length - 1]
    const newBlock: Block = {
      id: uuidv4(),
      bpm: last?.bpm ?? 120,
      delay: 0,
      beat: last?.beat ?? 4,
      split: last?.split ?? 4,
      measures: 4,
      notes: [],
    }
    updateChart(activeTabId, { ...chart, blocks: [...chart.blocks, newBlock] })
  }

  const insertBlockAfter = (blockId: string) => {
    if (!chart || !activeTabId) return
    const idx = chart.blocks.findIndex(b => b.id === blockId)
    const ref = chart.blocks[idx]
    const newBlock: Block = {
      id: uuidv4(),
      bpm: ref?.bpm ?? 120,
      delay: 0,
      beat: ref?.beat ?? 4,
      split: ref?.split ?? 4,
      measures: 4,
      notes: [],
    }
    const blocks = [...chart.blocks.slice(0, idx + 1), newBlock, ...chart.blocks.slice(idx + 1)]
    updateChart(activeTabId, { ...chart, blocks })
  }

  const duplicateBlock = (blockId: string) => {
    if (!chart || !activeTabId) return
    const idx = chart.blocks.findIndex(b => b.id === blockId)
    const orig = chart.blocks[idx]
    if (!orig) return
    const newBlock: Block = {
      ...orig,
      id: uuidv4(),
      notes: orig.notes.map(n => ({ ...n })),
    }
    const blocks = [...chart.blocks.slice(0, idx + 1), newBlock, ...chart.blocks.slice(idx + 1)]
    updateChart(activeTabId, { ...chart, blocks })
  }

  const deleteBlock = (blockId: string) => {
    if (!chart || !activeTabId) return
    if (chart.blocks.length <= 1) return
    updateChart(activeTabId, { ...chart, blocks: chart.blocks.filter(b => b.id !== blockId) })
  }

  const updateBlock = (blockId: string, patch: Partial<Block>) => {
    if (!chart || !activeTabId) return
    const blocks = chart.blocks.map(b => {
      if (b.id !== blockId) return b
      const updated = { ...b, ...patch, rowCount: undefined }
      const totalRows = updated.beat * updated.split * updated.measures
      const notes = updated.notes
        .map(n =>
          n.type === 'hold'
            ? { ...n, endRow: Math.min(n.endRow ?? n.row, totalRows - 1) }
            : n
        )
        .filter(n => n.row < totalRows)
      return { ...updated, notes }
    })
    updateChart(activeTabId, { ...chart, blocks })
  }

  return { chart, addNote, removeNote, addBlock, insertBlockAfter, duplicateBlock, deleteBlock, updateBlock }
}
