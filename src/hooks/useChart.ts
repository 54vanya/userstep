import { v4 as uuidv4 } from 'uuid'
import { useTabsStore } from '@/store/tabsStore'
import {
  splitBlockAt as splitBlockAtOp,
  mergeWithNext as mergeWithNextOp,
  deleteBelow as deleteBelowOp,
} from '@/utils/blockOps'
import type { Note, Block } from '@/types/chart'
import { blockCells } from '@/utils/geometry'
import { noteEnd } from '@/utils/holds'

export function useChart() {
  const { tabs, activeTabId, updateChart } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const chart = activeTab?.chart ?? null

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
      measures: 1,
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

  // Обёртки над чистыми операциями из utils/blockOps.ts.
  const splitBlockAt = (blockId: string, row: number) => {
    if (!chart || !activeTabId) return
    const next = splitBlockAtOp(chart, blockId, row)
    if (next) updateChart(activeTabId, next)
  }

  const mergeWithNext = (blockId: string) => {
    if (!chart || !activeTabId) return
    const next = mergeWithNextOp(chart, blockId)
    if (next) updateChart(activeTabId, next)
  }

  const deleteBelow = (blockId: string, row: number) => {
    if (!chart || !activeTabId) return
    const next = deleteBelowOp(chart, blockId, row)
    if (next) updateChart(activeTabId, next)
  }

  const updateBlock = (blockId: string, patch: Partial<Block>) => {
    if (!chart || !activeTabId) return
    const blocks = chart.blocks.map(b => {
      if (b.id !== blockId) return b
      const merged = { ...b, ...patch }
      // Adjust BeatSplit (как в StepEdit Lite): при смене split ноты остаются на
      // своих долях — строки пересчитываются пропорционально. Столкнувшиеся после
      // округления вниз (грубый split) ноты схлопываются в одну.
      if (patch.split !== undefined && patch.split !== b.split && b.split > 0) {
        const f = patch.split / b.split
        const rescaled: Note[] = []
        for (const n of b.notes) {
          const nn: Note = { ...n, row: Math.round(n.row * f) }
          if (nn.type === 'hold') nn.endRow = Math.max(nn.row, Math.round(noteEnd(n) * f))
          const collides = rescaled.some(k =>
            k.col === nn.col && noteEnd(k) >= nn.row && k.row <= noteEnd(nn))
          if (!collides) rescaled.push(nn)
        }
        merged.notes = rescaled
      }
      const cells = blockCells(merged.beat, merged.split)
      // rowCount — авторитетное целое число строк. Если задан явно (правка «Rows»),
      // берём его и пересчитываем measures под него. Иначе считаем из beat*split*measures
      // (measures дробное → округляем), сохраняя measures как есть, чтобы дробный ввод
      // не «снэпился» на каждом нажатии. Так блоки с неполным тактом (CS241) не ломаются
      // при правке любого поля.
      const rowCount = patch.rowCount !== undefined
        ? Math.max(1, Math.round(patch.rowCount))
        : Math.max(1, Math.round(cells * merged.measures))
      const measures = patch.rowCount !== undefined ? rowCount / cells : merged.measures
      const notes = merged.notes
        .map(n =>
          n.type === 'hold'
            ? { ...n, endRow: Math.min(noteEnd(n), rowCount - 1) }
            : n
        )
        .filter(n => n.row < rowCount)
      return { ...merged, rowCount, measures, notes }
    })
    updateChart(activeTabId, { ...chart, blocks })
  }

  return { chart, addBlock, insertBlockAfter, duplicateBlock, deleteBlock, updateBlock, splitBlockAt, mergeWithNext, deleteBelow }
}
