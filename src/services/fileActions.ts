// Файловые операции и операции над табами, доступные и из меню, и из клавиатурных
// шорткатов (Ctrl+N/O/W/S, Ctrl+Tab). Работают через getState, поэтому вызываемы
// вне React-компонентов.
import { set as idbSet } from 'idb-keyval'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from './audioEngine'
import { parseUcs } from './ucsParser'
import { serializeToUcs } from './ucsSerializer'

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function pickFile(accept: string, onPick: (file: File) => void): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) onPick(file)
  }
  input.click()
}

export function importUcsFile(file: File): void {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const chart = parseUcs(e.target?.result as string)
      const label = file.name.replace(/\.ucs$/i, '')
      chart.meta.title = label
      useTabsStore.getState().addTab(chart, label)
    } catch {
      alert('Failed to parse UCS file')
    }
  }
  reader.readAsText(file)
}

export function openPiuFile(file: File): void {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const chart = JSON.parse(e.target?.result as string)
      const label = chart.meta?.title || file.name.replace(/\.piu\.json$|\.json$/, '')
      const { addTab, setTabScale, setTabPlaybackRate } = useTabsStore.getState()
      const tabId = addTab(chart, label)
      if (chart.editorSettings) {
        setTabScale(tabId, chart.editorSettings.scale)
        setTabPlaybackRate(tabId, chart.editorSettings.playbackRate)
        audioEngine.setPlaybackRate(chart.editorSettings.playbackRate)
        useEditorStore.getState().setCurrentTime(chart.editorSettings.currentTime)
      }
    } catch {
      alert('Failed to parse .piu.json file')
    }
  }
  reader.readAsText(file)
}

export function importUcsViaDialog(): void {
  pickFile('.ucs', importUcsFile)
}

export function openPiuViaDialog(): void {
  pickFile('.json,.piu.json', openPiuFile)
}

export function exportActiveUcs(): void {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return
  downloadFile(`${tab.label}.ucs`, serializeToUcs(tab.chart), 'text/plain')
}

export function saveActivePiu(): void {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return
  const chartWithSettings = {
    ...tab.chart,
    editorSettings: {
      scale: tab.scale,
      playbackRate: tab.playbackRate,
      currentTime: useEditorStore.getState().currentTime,
    },
  }
  downloadFile(`${tab.label}.piu.json`, JSON.stringify(chartWithSettings, null, 2), 'application/json')
}

// Закрытие активной вкладки с тем же подтверждением, что и крестик в TabItem.
export function closeActiveTab(): void {
  const { tabs, activeTabId, closeTab } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return
  if (tab.isDirty && !confirm(`Close "${tab.label}"? Unsaved changes will be lost.`)) return
  closeTab(tab.id)
}

// Циклическое переключение вкладок (Ctrl+Tab / Ctrl+Shift+Tab).
export function cycleTabs(dir: 1 | -1): void {
  const { tabs, activeTabId, setActiveTab } = useTabsStore.getState()
  if (tabs.length < 2) return
  const idx = tabs.findIndex(t => t.id === activeTabId)
  const next = tabs[(idx + dir + tabs.length) % tabs.length]
  if (next) setActiveTab(next.id)
}

// Аудио в активную вкладку (та же цепочка, что useAudio.openAudio: стор +
// IndexedDB + декодирование движком).
export function openAudioFile(file: File): void {
  const { activeTabId, setAudioBlob } = useTabsStore.getState()
  if (!activeTabId) return
  setAudioBlob(activeTabId, file, file.name)
  idbSet(`audio:${activeTabId}`, file)
  audioEngine.loadBlob(file)
}

// Роутинг файла по типу: .ucs / .piu.json|.json / аудио. Для drag&drop в окно
// и file_handlers PWA (открытие файлов через ОС).
export function openDroppedFile(file: File): void {
  if (/\.ucs$/i.test(file.name)) importUcsFile(file)
  else if (/\.json$/i.test(file.name)) openPiuFile(file)
  else if (file.type.startsWith('audio/')) openAudioFile(file)
}
