import { useEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { togglePlayback } from '@/services/playbackControl'
import { ChartGrid } from './ChartGrid'
import { WelcomeScreen } from './WelcomeScreen'
import { useHitSounds } from '@/hooks/useHitSounds'
import { isTextEntry } from '@/utils/dom'
import { blockRowAtMs } from '@/utils/timing'
import { blockRowCount } from '@/utils/geometry'
import { clearColumnSpan, comparePos, placeHoldSpan, sanitizeHoldFlags, type BlockPos } from '@/utils/holds'
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
import { chartCols } from '@/types/chart'

// Активная вкладка + число колонок; null-safe обёртка для клавиатурных операций.
function activeTabState(): { tab: Tab; cols: number } | null {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return null
  return { tab, cols: chartCols(tab.chart) }
}

// Клавиши-колонки для ввода нот. Обе раскладки активны одновременно (коды не
// пересекаются, настройка не нужна):
// UCS Lite (StepEdit Lite) — физически повторяет крест панели: 1P — Z Q S E C
//   (колонки 0–4), 2P — NumPad 1 7 5 9 3 (5–9), именно цифровым блоком;
// StepMania — верхний ряд цифр 1…9, 0 → колонки 0–9 слева направо.
// По e.code — не зависит от раскладки ОС.
const LIVE_KEYS: Record<string, number> = {
  KeyZ: 0, KeyQ: 1, KeyS: 2, KeyE: 3, KeyC: 4,
  Numpad1: 5, Numpad7: 6, Numpad5: 7, Numpad9: 8, Numpad3: 9,
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4,
  Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9,
}

export function ChartEditor() {
  const { tabs, activeTabId } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Озвучка нот у курсора (сам хук внутри проверяет флаг/воспроизведение).
  useHitSounds()

  useEffect(() => {
    audioEngine.setPlaybackRate(activeTab?.playbackRate ?? 1.0)
  }, [activeTabId, activeTab?.playbackRate])

  useEffect(() => {
    // Рисование холда с клавиатуры: пока клавиша-колонка зажата, ArrowDown/Up
    // растягивает/укорачивает холд от строки постановки (только на паузе;
    // через границы блоков — цепочкой continues/continued, как мышиный drag).
    // На время жеста undo-история ставится на паузу — весь жест сворачивается
    // в один шаг отмены (снэпшот тапа при keydown).
    let keyHold: {
      code: string
      col: number
      tabId: string
      anchor: BlockPos
      end: BlockPos
      paused: boolean
    } | null = null

    const endKeyHold = () => {
      if (keyHold?.paused) useTabsStore.temporal.getState().resume()
      keyHold = null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Инвариант: НИ ОДНА настройка в тулбаре (слайдеры, чекбоксы, кнопки) не должна
      // перехватывать пробел — он всегда play/pause. Поэтому «инпутом» считаем только
      // поля ВВОДА ТЕКСТА (text/number/textarea/select/contenteditable); range,
      // checkbox, radio, button и т.п. — нет, и пробел на них уходит в play/pause
      // (preventDefault ниже гасит нативное действие контрола, напр. тогл чекбокса).
      const inInput = isTextEntry(target)

      // Стор читаем через getState: слушатель регистрируется один раз и не
      // перевешивается на каждый тик currentTime при скролле.
      const ed = useEditorStore.getState()

      if (e.code === 'Space' && !inInput) {
        e.preventDefault()
        togglePlayback()
        return
      }

      // Клавиатурный ввод нот — работает всегда, не только при playback.
      // Во время playback (live-запись): tap на ближайшую к текущему моменту
      // строку (квантование на линию сплита бесплатно — row дискретен),
      // существующая нота замещается. На паузе: клавиша работает как клик по
      // строке под курсором — пустая ячейка получает tap, занятая очищается.
      if (!inInput && !e.repeat && !e.altKey
          && !e.ctrlKey && !e.metaKey && LIVE_KEYS[e.code] !== undefined) {
        const col = LIVE_KEYS[e.code]
        const st = activeTabState()
        if (!st || col >= st.cols) return
        e.preventDefault()
        // Ввод ноты уводит фокус с контролов сайдбара (checkbox/slider): навигация
        // ChartGrid пропускает INPUT-таргеты (стрелки нужны слайдерам), и с фокусом
        // на контроле стрелки жеста холда растягивали бы ноту, не двигая курсор.
        if (target instanceof HTMLElement && target.tagName === 'INPUT') target.blur()
        const ms = ed.isPlaying ? audioEngine.getCurrentMs() : ed.currentTime
        const pos = blockRowAtMs(st.tab.chart.blocks, ms)
        if (!pos) return
        const block = st.tab.chart.blocks[pos.blockIdx]
        const filtered = clearColumnSpan(block.notes, col, pos.row, pos.row)
        // Тогл только на паузе: при live-записи повторный удар по строке
        // должен оставлять ноту, а не стирать её.
        const toggledOff = !ed.isPlaying && filtered.length !== block.notes.length
        const notes = toggledOff ? filtered : [...filtered, { row: pos.row, col, type: 'tap' as const }]
        const blocks = st.tab.chart.blocks.map((b, i) => (i === pos.blockIdx ? { ...b, notes } : b))
        // Затронутая нота могла быть частью кросс-блочного холда — чистим
        // зависшие continues/continued у соседей.
        useTabsStore.getState().updateChart(st.tab.id, { ...st.tab.chart, blocks: sanitizeHoldFlags(blocks) })
        // Якорь для растягивания холда стрелками, пока клавиша зажата.
        if (!ed.isPlaying && !toggledOff) {
          const anchor = { blockIdx: pos.blockIdx, row: pos.row }
          keyHold = { code: e.code, col, tabId: st.tab.id, anchor, end: anchor, paused: false }
        }
        return
      }

      // Зажатая клавиша-колонка + ArrowDown/Up — растягивание холда от якоря
      // в ОБЕ стороны (вниз и вверх), через границы блоков; обратное движение
      // укорачивает, на якоре холд схлопывается в tap. preventDefault не зовём:
      // курсор двигает обработчик навигации ChartGrid.
      if (keyHold && !ed.isPlaying && !inInput && !e.altKey && !e.ctrlKey && !e.metaKey
          && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
        const st = activeTabState()
        if (!st || st.tab.id !== keyHold.tabId) {
          endKeyHold()
          return
        }
        const blocks = st.tab.chart.blocks
        const dir = e.code === 'ArrowDown' ? 1 : -1
        // Шаг конца холда на строку; выход за границу блока — переход к соседнему.
        let next: BlockPos = { blockIdx: keyHold.end.blockIdx, row: keyHold.end.row + dir }
        if (next.row < 0) {
          if (next.blockIdx === 0) return
          next = { blockIdx: next.blockIdx - 1, row: blockRowCount(blocks[next.blockIdx - 1]) - 1 }
        } else if (next.row >= blockRowCount(blocks[next.blockIdx])) {
          if (next.blockIdx === blocks.length - 1) return
          next = { blockIdx: next.blockIdx + 1, row: 0 }
        }
        if (comparePos(next, keyHold.end) === 0) return
        const prevEnd = keyHold.end
        keyHold.end = next
        if (!keyHold.paused) {
          useTabsStore.temporal.getState().pause()
          keyHold.paused = true
        }
        // Пролёт — между якорем и подвижным концом (конец может быть и выше
        // якоря); расчистка покрывает объединение с прежним пролётом, чтобы
        // при укорачивании стирался остаток прежнего холда с любой стороны.
        const minPos = (a: BlockPos, b: BlockPos) => (comparePos(a, b) <= 0 ? a : b)
        const maxPos = (a: BlockPos, b: BlockPos) => (comparePos(a, b) >= 0 ? a : b)
        const start = minPos(keyHold.anchor, next)
        const end = maxPos(keyHold.anchor, next)
        const newBlocks = placeHoldSpan(
          blocks, keyHold.col, start, end, maxPos(end, prevEnd), minPos(start, prevEnd),
        )
        useTabsStore.getState().updateChart(st.tab.id, { ...st.tab.chart, blocks: sanitizeHoldFlags(newBlocks) })
        return
      }

      // Esc — снять выделение (как в StepEdit Lite).
      if (e.code === 'Escape') {
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
          const pos = blockRowAtMs(blocks, ed.currentTime)
          if (!pos) return
          ed.setSelection({
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
          const sel = ed.selection
          if (!sel) return
          e.preventDefault()
          const st = activeTabState()
          if (st) copySelection(st.tab.chart, sel)
          return
        }
        case 'KeyX': {
          // Cut = copy + delete.
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

    // Отпускание клавиши-колонки завершает жест холда; blur окна — страховка
    // (keyup мог не долететь), иначе undo-история осталась бы на паузе.
    const onKeyUp = (e: KeyboardEvent) => {
      if (keyHold && e.code === keyHold.code) endKeyHold()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', endKeyHold)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', endKeyHold)
      endKeyHold()
    }
  }, [])

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
