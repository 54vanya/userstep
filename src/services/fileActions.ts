// Файловые операции и операции над табами, доступные и из меню, и из клавиатурных
// шорткатов (Ctrl+N/O/W/S, Ctrl+Tab). Работают через getState, поэтому вызываемы
// вне React-компонентов.
import { set as idbSet } from 'idb-keyval'
import type { Chart } from '@/types/chart'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from './audioEngine'
import { parseUcs } from './ucsParser'
import { serializeToUcs } from './ucsSerializer'
import { serializeToSm } from './smSerializer'
import { isValidChart } from '@/utils/chartGuard'

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

function readFileText(file: File, onText: (text: string) => void): void {
  const reader = new FileReader()
  reader.onload = e => onText(e.target?.result as string)
  reader.readAsText(file)
}

// Разбор содержимого .ucs / .piu.json с алертом при ошибке. Единственная точка
// парсинга и валидации: и «в новый таб», и «в пустой таб» (WelcomeScreen) идут
// через неё — битый файл не должен доезжать до стора ни одним путём.
function parseUcsText(text: string, fileName: string): { chart: Chart; label: string } | null {
  try {
    const chart = parseUcs(text)
    const label = fileName.replace(/\.ucs$/i, '')
    chart.meta.title = label
    return { chart, label }
  } catch {
    alert('Failed to parse UCS file')
    return null
  }
}

function parsePiuText(text: string, fileName: string): { chart: Chart; label: string } | null {
  try {
    const chart = JSON.parse(text)
    // Любой валидный JSON без формы чарта уронил бы рендер, а сессия сохранила
    // бы битый таб → крэш при каждом запуске.
    if (!isValidChart(chart)) {
      alert('Not a valid .piu.json chart file')
      return null
    }
    const label = chart.meta.title || fileName.replace(/\.piu\.json$|\.json$/i, '')
    return { chart, label }
  } catch {
    alert('Failed to parse .piu.json file')
    return null
  }
}

// editorSettings из файла — только конечные числа (в старых/чужих файлах поля
// могут отсутствовать; NaN в scale/rate ломал бы геометрию и плейбек).
function applyEditorSettings(tabId: string, settings: Chart['editorSettings']): void {
  if (!settings) return
  const { setTabScale, setTabPlaybackRate } = useTabsStore.getState()
  const { scale, playbackRate, currentTime } = settings
  if (Number.isFinite(scale)) setTabScale(tabId, scale)
  if (Number.isFinite(playbackRate)) {
    setTabPlaybackRate(tabId, playbackRate)
    audioEngine.setPlaybackRate(playbackRate)
  }
  if (Number.isFinite(currentTime)) useEditorStore.getState().setCurrentTime(currentTime)
}

export function importUcsFile(file: File): void {
  readFileText(file, text => {
    const parsed = parseUcsText(text, file.name)
    if (parsed) useTabsStore.getState().addTab(parsed.chart, parsed.label)
  })
}

export function openPiuFile(file: File): void {
  readFileText(file, text => {
    const parsed = parsePiuText(text, file.name)
    if (!parsed) return
    const tabId = useTabsStore.getState().addTab(parsed.chart, parsed.label)
    applyEditorSettings(tabId, parsed.chart.editorSettings)
  })
}

// Импорт в существующий пустой таб (WelcomeScreen) — тот же разбор/валидация.
export function importUcsIntoTab(tabId: string, file: File): void {
  readFileText(file, text => {
    const parsed = parseUcsText(text, file.name)
    if (parsed) useTabsStore.getState().importChartIntoTab(tabId, parsed.chart, parsed.label)
  })
}

export function openPiuIntoTab(tabId: string, file: File): void {
  readFileText(file, text => {
    const parsed = parsePiuText(text, file.name)
    if (!parsed) return
    useTabsStore.getState().importChartIntoTab(tabId, parsed.chart, parsed.label)
    applyEditorSettings(tabId, parsed.chart.editorSettings)
  })
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

export function exportActiveSm(): void {
  const { tabs, activeTabId } = useTabsStore.getState()
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return
  downloadFile(`${tab.label}.sm`, serializeToSm(tab.chart), 'text/plain')
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
