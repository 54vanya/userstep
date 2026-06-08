import { create } from 'zustand'
import { temporal } from 'zundo'
import { v4 as uuidv4 } from 'uuid'
import type { Chart, Tab } from '@/types/chart'
import { saveSession, loadSession } from '@/services/sessionStorage'

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

export const useTabsStore = create<TabsState>()(
  temporal(
    (set) => ({
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
        set(state => ({
          tabs: [...state.tabs, tab],
          activeTabId: tabId,
        }))
        return tabId
      },

      closeTab: (tabId) => {
        set(state => {
          const idx = state.tabs.findIndex(t => t.id === tabId)
          const newTabs = state.tabs.filter(t => t.id !== tabId)
          let newActiveId = state.activeTabId
          if (state.activeTabId === tabId) {
            newActiveId = newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0]?.id ?? null
          }
          return { tabs: newTabs, activeTabId: newActiveId }
        })
      },

      setActiveTab: (tabId) => {
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
                ? { scale: Math.min(10, Math.max(1, settings.scale)) }
                : {}),
              ...(settings?.playbackRate !== undefined
                ? { playbackRate: Math.round(Math.min(1.5, Math.max(0.5, settings.playbackRate)) * 10) / 10 }
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
        const clamped = Math.min(10, Math.max(1, scale))
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, scale: clamped } : t),
        }))
      },

      setTabPlaybackRate: (tabId, rate) => {
        const clamped = Math.round(Math.min(1.5, Math.max(0.5, rate)) * 10) / 10
        set(state => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, playbackRate: clamped } : t),
        }))
      },
    }),
    {
      limit: 50,
      partialize: (state) => ({ tabs: state.tabs }),
    }
  )
)

let _saveTimer: ReturnType<typeof setTimeout> | undefined
useTabsStore.subscribe(state => {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => saveSession(state.tabs, state.activeTabId), 500)
})
