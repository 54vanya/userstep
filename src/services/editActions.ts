// Общие операции редактирования: их зовут и глобальные шорткаты (ChartEditor),
// и кнопки раздела Edit в сайдбаре. Все — null-safe: без активной вкладки,
// выделения или клипборда операция просто не выполняется. Каждая мутация —
// один updateChart = один undo-снэпшот.
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { blockRowAtMs } from '@/utils/timing'
import { blockRowCount } from '@/utils/geometry'
import { chartCols, type Tab } from '@/types/chart'
import {
  deleteSelection,
  copySelection,
  pasteClipboard,
  flipSelection,
  type FlipMode,
} from './selectionOps'

// Активная вкладка + число колонок; null-safe обёртка для операций.
export function activeTabState(): { tab: Tab; cols: number } | null {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return null
  return { tab, cols: chartCols(tab.chart) }
}

export function undoEdit(): void {
  useTabsStore.temporal.getState().undo()
}

export function redoEdit(): void {
  useTabsStore.temporal.getState().redo()
}

// Ctrl+A: выделение у нас per-block (блоки различаются split'ом), поэтому
// выделяем целиком блок под курсором (по currentTime).
export function selectBlockAtCursor(): void {
  const st = activeTabState()
  if (!st) return
  const ed = useEditorStore.getState()
  const blocks = st.tab.chart.blocks
  const pos = blockRowAtMs(blocks, ed.currentTime)
  if (!pos) return
  ed.setSelection({
    kind: 'rows',
    blockId: blocks[pos.blockIdx].id,
    fromRow: 0,
    toRow: blockRowCount(blocks[pos.blockIdx]) - 1,
  })
}

// Копия выделения во внутренний клипборд. bumpClipVersion — реактивность кнопки
// Paste в сайдбаре (сам клипборд — модульная переменная selectionOps, не стор).
// Выделение снимается (как у Cut): иначе оно молча живёт за экраном и
// перехватывает якорь последующей вставки — Ctrl+V уходил бы в место копирования.
export function copySel(): boolean {
  const ed = useEditorStore.getState()
  const st = activeTabState()
  if (!st || !ed.selection) return false
  if (!copySelection(st.tab.chart, ed.selection)) return false
  ed.bumpClipVersion()
  ed.setSelection(null)
  return true
}

// Cut = copy + delete.
export function cutSel(): void {
  const ed = useEditorStore.getState()
  const st = activeTabState()
  if (!st || !ed.selection) return
  if (!copySel()) return
  const next = deleteSelection(st.tab.chart, ed.selection)
  if (next) useTabsStore.getState().updateChart(st.tab.id, next)
  ed.setSelection(null)
}

export function deleteSel(): void {
  const ed = useEditorStore.getState()
  const st = activeTabState()
  if (!st || !ed.selection) return
  const next = deleteSelection(st.tab.chart, ed.selection)
  if (next) useTabsStore.getState().updateChart(st.tab.id, next)
  ed.setSelection(null)
}

// X (h) — зеркало по колонкам, Y (v) — реверс строк, M — оба.
export function flipSel(mode: FlipMode): void {
  const ed = useEditorStore.getState()
  const st = activeTabState()
  if (!st || !ed.selection) return
  const next = flipSelection(st.tab.chart, ed.selection, mode, st.cols)
  if (next) useTabsStore.getState().updateChart(st.tab.id, next)
}

// Вставка: в начало выделения, иначе — от строки под плейхедом.
// withOffset — вставка со сдвигом колонок (+1 за вызов, с заворотом).
export function pasteSel(withOffset: boolean): void {
  const ed = useEditorStore.getState()
  const st = activeTabState()
  if (!st) return
  const blocks = st.tab.chart.blocks
  const sel = ed.selection
  let target: { blockIdx: number; row: number } | null = null
  if (sel) {
    const bi = blocks.findIndex(b => b.id === sel.blockId)
    if (bi >= 0) target = { blockIdx: bi, row: sel.kind === 'rows' ? sel.fromRow : 0 }
  }
  if (!target) target = blockRowAtMs(blocks, ed.currentTime)
  if (!target) return
  const res = pasteClipboard(st.tab.chart, st.cols, target, withOffset)
  if (res) {
    useTabsStore.getState().updateChart(st.tab.id, res.chart)
    ed.setSelection(res.selection)
  }
}
