import { useEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { ChartGrid } from './ChartGrid'
import { WelcomeScreen } from './WelcomeScreen'
import { useHitSounds } from '@/hooks/useHitSounds'
import { isTextEntry } from '@/utils/dom'
import { blockRowAtMs } from '@/utils/timing'
import { blockRowCount } from '@/utils/geometry'
import {
  saveActivePiu,
  importUcsViaDialog,
  closeActiveTab,
  cycleTabs,
} from '@/services/fileActions'
import {
  deleteSelection,
  copySelection,
  pasteClipboard,
  flipSelection,
} from '@/services/selectionOps'
import type { Tab } from '@/types/chart'

// Активная вкладка + число колонок; null-safe обёртка для клавиатурных операций.
function activeTabState(): { tab: Tab; cols: number } | null {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return null
  return { tab, cols: tab.chart.chartType === 'Double' ? 10 : 5 }
}

// Live-запись при воспроизведении (StepEdit Lite): раскладка физически повторяет
// крест панели. 1P — Z Q S E C (колонки 0–4), 2P — NumPad 1 7 5 9 3 (5–9).
// По e.code — не зависит от раскладки ОС; NumPad именно цифровым блоком.
const LIVE_KEYS: Record<string, number> = {
  KeyZ: 0, KeyQ: 1, KeyS: 2, KeyE: 3, KeyC: 4,
  Numpad1: 5, Numpad7: 6, Numpad5: 7, Numpad9: 8, Numpad3: 9,
}

export function ChartEditor() {
  const { tabs, activeTabId } = useTabsStore()
  const { isPlaying, currentTime, setPlaying, setCurrentTime } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Озвучка нот у курсора (сам хук внутри проверяет флаг/воспроизведение).
  useHitSounds()

  useEffect(() => {
    audioEngine.setPlaybackRate(activeTab?.playbackRate ?? 1.0)
  }, [activeTabId, activeTab?.playbackRate])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Инвариант: НИ ОДНА настройка в тулбаре (слайдеры, чекбоксы, кнопки) не должна
      // перехватывать пробел — он всегда play/pause. Поэтому «инпутом» считаем только
      // поля ВВОДА ТЕКСТА (text/number/textarea/select/contenteditable); range,
      // checkbox, radio, button и т.п. — нет, и пробел на них уходит в play/pause
      // (preventDefault ниже гасит нативное действие контрола, напр. тогл чекбокса).
      const inInput = isTextEntry(target)

      if (e.code === 'Space' && !inInput) {
        e.preventDefault()
        if (!audioEngine.hasAudio()) return
        if (isPlaying) {
          const pausedAt = audioEngine.getCurrentMs()
          audioEngine.pause()
          setPlaying(false)
          setCurrentTime(pausedAt)
        } else {
          audioEngine.play(currentTime)
          setPlaying(true)
        }
        return
      }

      // Live-запись: во время playback клавиши-стрелки кладут tap на ближайшую
      // к текущему моменту строку (квантование на линию сплита бесплатно — row
      // дискретен). Существующая нота в ячейке замещается.
      if (isPlaying && !inInput && !e.repeat && !e.altKey
          && !e.ctrlKey && !e.metaKey && LIVE_KEYS[e.code] !== undefined) {
        const col = LIVE_KEYS[e.code]
        const st = activeTabState()
        if (!st || col >= st.cols) return
        e.preventDefault()
        const pos = blockRowAtMs(st.tab.chart.blocks, audioEngine.getCurrentMs())
        if (!pos) return
        const blocks = st.tab.chart.blocks.map((b, i) => {
          if (i !== pos.blockIdx) return b
          const filtered = b.notes.filter(n => {
            if (n.col !== col) return true
            const end = n.type === 'hold' ? (n.endRow ?? n.row) : n.row
            return pos.row < n.row || pos.row > end
          })
          return { ...b, notes: [...filtered, { row: pos.row, col, type: 'tap' as const }] }
        })
        useTabsStore.getState().updateChart(st.tab.id, { ...st.tab.chart, blocks })
        return
      }

      // Esc — снять выделение (как в StepEdit Lite).
      if (e.code === 'Escape') {
        const ed = useEditorStore.getState()
        if (ed.selection) ed.setSelection(null)
        return
      }

      const mod = e.ctrlKey || e.metaKey

      // Ctrl+Tab / Ctrl+Shift+Tab — переключение вкладок (как в StepEdit Lite).
      // В обычной браузерной вкладке Ctrl+Tab зарезервирован браузером и сюда не
      // долетает, но в standalone-PWA работает.
      if (e.ctrlKey && e.code === 'Tab') {
        e.preventDefault()
        cycleTabs(e.shiftKey ? -1 : 1)
        return
      }

      // Операции над выделением без модификаторов: Delete/Backspace — удалить,
      // X / Y / M — flip horizontal / vertical / mirror (как в StepEdit Lite).
      if (!mod && !e.altKey && !inInput) {
        const ed = useEditorStore.getState()
        const sel = ed.selection
        if (sel) {
          if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault()
            const st = activeTabState()
            if (!st) return
            const next = deleteSelection(st.tab.chart, sel)
            if (next) useTabsStore.getState().updateChart(st.tab.id, next)
            ed.setSelection(null)
            return
          }
          if (e.code === 'KeyX' || e.code === 'KeyY' || e.code === 'KeyM') {
            e.preventDefault()
            const st = activeTabState()
            if (!st) return
            const flipMode = e.code === 'KeyX' ? 'h' : e.code === 'KeyY' ? 'v' : 'm'
            const next = flipSelection(st.tab.chart, sel, flipMode, st.cols)
            if (next) useTabsStore.getState().updateChart(st.tab.id, next)
            return
          }
        }
      }

      if (!mod || inInput) return

      switch (e.code) {
        case 'KeyZ':
          e.preventDefault()
          if (e.shiftKey) useTabsStore.temporal.getState().redo()
          else useTabsStore.temporal.getState().undo()
          return
        case 'KeyY':
          e.preventDefault()
          useTabsStore.temporal.getState().redo()
          return
        case 'KeyS':
          e.preventDefault()
          saveActivePiu()
          return
        case 'KeyN':
          e.preventDefault()
          useTabsStore.getState().addTab()
          return
        case 'KeyO':
          e.preventDefault()
          importUcsViaDialog()
          return
        case 'KeyW':
          e.preventDefault()
          closeActiveTab()
          return
        case 'KeyA': {
          // Select all: выделение у нас per-block (блоки различаются split'ом),
          // поэтому выделяем целиком блок под курсором (по currentTime).
          e.preventDefault()
          const st = activeTabState()
          if (!st) return
          const blocks = st.tab.chart.blocks
          const pos = blockRowAtMs(blocks, useEditorStore.getState().currentTime)
          if (!pos) return
          useEditorStore.getState().setSelection({
            kind: 'rows',
            blockId: blocks[pos.blockIdx].id,
            fromRow: 0,
            toRow: blockRowCount(blocks[pos.blockIdx]) - 1,
          })
          return
        }
        case 'KeyC': {
          // Копируем только при активном выделении (иначе не мешаем системному
          // Ctrl+C, например для текста в сайдбаре).
          const sel = useEditorStore.getState().selection
          if (!sel) return
          e.preventDefault()
          const st = activeTabState()
          if (st) copySelection(st.tab.chart, sel)
          return
        }
        case 'KeyX': {
          // Cut = copy + delete.
          const ed = useEditorStore.getState()
          const sel = ed.selection
          if (!sel) return
          e.preventDefault()
          const st = activeTabState()
          if (!st || !copySelection(st.tab.chart, sel)) return
          const next = deleteSelection(st.tab.chart, sel)
          if (next) useTabsStore.getState().updateChart(st.tab.id, next)
          ed.setSelection(null)
          return
        }
        case 'KeyV': {
          // Вставка: в начало выделения, иначе — от строки под плейхедом.
          // Shift — вставка со сдвигом колонок (+1 за нажатие, с заворотом).
          e.preventDefault()
          const st = activeTabState()
          if (!st) return
          const ed = useEditorStore.getState()
          const blocks = st.tab.chart.blocks
          const sel = ed.selection
          let target: { blockIdx: number; row: number } | null = null
          if (sel) {
            const bi = blocks.findIndex(b => b.id === sel.blockId)
            if (bi >= 0) target = { blockIdx: bi, row: sel.kind === 'rows' ? sel.fromRow : 0 }
          }
          if (!target) target = blockRowAtMs(blocks, ed.currentTime)
          if (!target) return
          const res = pasteClipboard(st.tab.chart, st.cols, target, e.shiftKey)
          if (res) {
            useTabsStore.getState().updateChart(st.tab.id, res.chart)
            ed.setSelection(res.selection)
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPlaying, currentTime, setPlaying, setCurrentTime])

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <p className="text-lg">No chart open</p>
          <p>Import a .ucs file or create a new chart</p>
        </div>
      </div>
    )
  }

  if (activeTab.isBlank) {
    return <WelcomeScreen tabId={activeTab.id} />
  }

  return (
    <div className="flex-1 overflow-hidden">
      <ChartGrid />
    </div>
  )
}
