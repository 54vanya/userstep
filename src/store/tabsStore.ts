import { create } from 'zustand'
import { temporal } from 'zundo'
import { del as idbDel } from 'idb-keyval'
import { v4 as uuidv4 } from 'uuid'
import type { Chart, Tab } from '@/types/chart'
import { saveSession, loadSession } from '@/services/sessionStorage'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { tabTimes } from '@/utils/tabTime'
import { MAX_SCALE, MIN_SCALE } from '@/utils/geometry'

// Своп позиции воспроизведения при смене активной вкладки: сохраняем время
// уходящей вкладки, грузим время входящей, останавливаем playback (аудио разное).
function swapActiveTime(prevId: string | null, nextId: string | null, nextTime?: number) {
  const ed = useEditorStore.getState()
  // Во время playback живая позиция в audioEngine (editorStore.currentTime не
  // обновляется покадрово), иначе — в editorStore.
  const outgoing = audioEngine.isPlaying() ? audioEngine.getCurrentMs() : ed.currentTime
  if (prevId) tabTimes.set(prevId, outgoing)
  if (audioEngine.isPlaying()) audioEngine.pause()
  ed.setPlaying(false)
  ed.setCurrentTime(nextTime ?? (nextId ? tabTimes.get(nextId) ?? 0 : 0))
}

function makeEmptyChart(): Chart {
  return {
    id: uuidv4(),
    version: 1,
    meta: { title: 'Untitled', artist: '' },
    chartType: 'Single',
    difficulty: 1,
    blocks: [
      {
        id: uuidv4(),
        bpm: 120,
        delay: 0,
        beat: 4,
        split: 4,
        measures: 4,
        notes: [],
      },
    ],
  }
}

interface ChartMetaPatch {
  meta?: Partial<Chart['meta']>
  difficulty?: number
  chartType?: Chart['chartType']
}

interface EditorSettingsPatch {
  scale?: number
  playbackRate?: number
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null

  addTab: (chart?: Chart, label?: string) => string
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateChart: (tabId: string, chart: Chart) => void
  updateChartMeta: (tabId: string, patch: ChartMetaPatch) => void
  importChartIntoTab: (tabId: string, chart: Chart, label: string, settings?: EditorSettingsPatch) => void
  markDirty: (tabId: string, dirty: boolean) => void
  markBlank: (tabId: string, isBlank: boolean) => void
  setAudioBlob: (tabId: string, blob: Blob, fileName: string) => void
  setTabScale: (tabId: string, scale: number) => void
  setTabPlaybackRate: (tabId: string, rate: number) => void
}

const _stored = loadSession()

// Восстановление позиций воспроизведения из прошлой сессии: заполняем tabTimes
// (источник правды при переключении вкладок) и сразу выставляем currentTime
// активной вкладки, чтобы ChartGrid при первом маунте проскроллил на неё.
// Бэкап-источник для старых сессий без `times` — chart.editorSettings.currentTime.
if (_stored?.tabs) {
  for (const t of _stored.tabs) {
    tabTimes.set(t.id, _stored.times?.[t.id] ?? t.chart.editorSettings?.currentTime ?? 0)
  }
  if (_stored.activeTabId) {
    useEditorStore.getState().setCurrentTime(tabTimes.get(_stored.activeTabId) ?? 0)
  }
}

export const useTabsStore = create<TabsState>()(
  temporal(
    (set, get) => ({
      tabs: _stored?.tabs ?? [],
      activeTabId: _stored?.activeTabId ?? null,

      addTab: (chart, label) => {
        const newChart = chart ?? makeEmptyChart()
        const tabId = uuidv4()
        const tab: Tab = {
          id: tabId,
          chart: newChart,
          isDirty: false,
          label: label ?? newChart.meta.title ?? 'New Chart',
          scale: 3,
          playbackRate: 1.0,
          isBlank: chart === undefined,
        }
        const initialTime = newChart.editorSettings?.currentTime ?? 0
        tabTimes.set(tabId, initialTime)
        swapActiveTime(get().activeTabId, tabId, initialTime)
        set(state => ({
          tabs: [...state.tabs, tab],
          activeTabId: tabId,
        }))
        return tabId
      },

      closeTab: (tabId) => {
        const state = get()
        const idx = state.tabs.findIndex(t => t.id === tabId)
        const newTabs = state.tabs.filter(t => t.id !== tabId)
        let newActiveId = state.activeTabId
        if (state.activeTabId === tabId) {
          newActiveId = newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id ?? null
          // Активная вкладка закрыта — грузим время новой активной; prevId=null:
          // время закрываемой вкладки не сохраняем (её запись сейчас удалится).
          swapActiveTime(null, newActiveId)
        }
        tabTimes.delete(tabId)
        // Иначе многомегабайтные аудиоблобы закрытых вкладок копятся в IndexedDB
        // бессрочно. Undo закрытия вернёт blob из снэпшота (в памяти), но повторное
        // сохранение в IDB произойдёт только при новой загрузке аудио.
        idbDel(`audio:${tabId}`).catch(() => {})
        set({ tabs: newTabs, activeTabId: newActiveId })
      },

      setActiveTab: (tabId) => {
        if (get().activeTabId === tabId) return
        swapActiveTime(get().activeTabId, tabId)
        set({ activeTabId: tabId })
      },

      updateChart: (tabId, chart) => {
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, chart, isDirty: true } : t),
        }))
      },

      updateChartMeta: (tabId, patch) => {
        set(state => ({
          tabs: state.tabs.map(t => {
            if (t.id !== tabId) return t
            const chart: Chart = {
              ...t.chart,
              ...(patch.difficulty !== undefined ? { difficulty: patch.difficulty } : {}),
              ...(patch.chartType !== undefined ? { chartType: patch.chartType } : {}),
              meta: { ...t.chart.meta, ...patch.meta },
            }
            const label = patch.meta?.title ?? t.label
            return { ...t, chart, label, isDirty: true }
          }),
        }))
      },

      importChartIntoTab: (tabId, chart, label, settings) => {
        set(state => ({
          tabs: state.tabs.map(t => {
            if (t.id !== tabId) return t
            return {
              ...t,
              chart,
              label,
              isDirty: true,
              isBlank: false,
              ...(settings?.scale !== undefined
                ? { scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, settings.scale)) }
                : {}),
              ...(settings?.playbackRate !== undefined
                ? { playbackRate: Math.round(Math.min(2, Math.max(0.2, settings.playbackRate)) * 100) / 100 }
                : {}),
            }
          }),
        }))
      },

      markDirty: (tabId, dirty) => {
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t),
        }))
      },

      markBlank: (tabId, isBlank) => {
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, isBlank } : t),
        }))
      },

      setAudioBlob: (tabId, blob, fileName) => {
        set(state => ({
          tabs: state.tabs.map(t =>
            t.id === tabId
              ? { ...t, audioBlob: blob, chart: { ...t.chart, audioFileName: fileName } }
              : t
          ),
        }))
      },

      setTabScale: (tabId, scale) => {
        const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, scale: clamped } : t),
        }))
      },

      setTabPlaybackRate: (tabId, rate) => {
        // Максимум 2×; минимум 0.2, чтобы шаг слайдера 0.1 попадал ровно в 1.0.
        const clamped = Math.round(Math.min(2, Math.max(0.2, rate)) * 100) / 100
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, playbackRate: clamped } : t),
        }))
      },
    }),
    {
      limit: 50,
      partialize: (state) => ({ tabs: state.tabs }),
      // В историю undo попадают только правки чартов и состав вкладок. Без этого
      // каждый set() (тик слайдера scale, markDirty, переключение вкладки) пушил бы
      // снэпшот и вымывал 50-шаговую историю реальных правок.
      equality: (past, current) =>
        past.tabs.length === current.tabs.length &&
        past.tabs.every((t, i) => t.id === current.tabs[i].id && t.chart === current.tabs[i].chart),
    }
  )
)

// Сохранение сессии вместе с позициями вкладок. Живое время активной вкладки
// (во время playback — из audioEngine, иначе — из editorStore) подмешиваем в
// tabTimes прямо перед сериализацией, т.к. оно не хранится в tabsStore и обычная
// подписка на изменения табов его не ловит.
function flushSession(): void {
  const { tabs, activeTabId } = useTabsStore.getState()
  if (activeTabId) {
    const ed = useEditorStore.getState()
    const live = audioEngine.isPlaying() ? audioEngine.getCurrentMs() : ed.currentTime
    tabTimes.set(activeTabId, live)
  }
  const times: Record<string, number> = {}
  for (const t of tabs) times[t.id] = tabTimes.get(t.id) ?? 0
  saveSession(tabs, activeTabId, times)
}

let _saveTimer: ReturnType<typeof setTimeout> | undefined
useTabsStore.subscribe(() => {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(flushSession, 500)
})

// Перезагрузка/закрытие/сворачивание вкладки браузера: дебаунс мог не успеть, а
// время-онли изменения (скраб/пауза) вообще не триггерят подписку — поэтому
// флашим синхронно на pagehide и при скрытии (надёжнее beforeunload в PWA/моб.).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSession)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSession()
  })
}
