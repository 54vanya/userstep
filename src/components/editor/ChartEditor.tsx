import { useEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { ChartGrid } from './ChartGrid'
import { WelcomeScreen } from './WelcomeScreen'

export function ChartEditor() {
  const { tabs, activeTabId } = useTabsStore()
  const { isPlaying, currentTime, setPlaying, setCurrentTime } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  useEffect(() => {
    audioEngine.setPlaybackRate(activeTab?.playbackRate ?? 1.0)
  }, [activeTabId, activeTab?.playbackRate])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

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

      const mod = e.ctrlKey || e.metaKey

      if (mod && e.code === 'KeyZ' && !inInput) {
        e.preventDefault()
        if (e.shiftKey) {
          useTabsStore.temporal.getState().redo()
        } else {
          useTabsStore.temporal.getState().undo()
        }
        return
      }

      if (mod && e.code === 'KeyS' && !inInput) {
        e.preventDefault()
        const { tabs: currentTabs, activeTabId: currentActiveId } = useTabsStore.getState()
        const tab = currentTabs.find(t => t.id === currentActiveId)
        if (!tab) return
        const { currentTime: ct } = useEditorStore.getState()
        const chartWithSettings = {
          ...tab.chart,
          editorSettings: {
            scale: tab.scale,
            playbackRate: tab.playbackRate,
            currentTime: ct,
          },
        }
        const json = JSON.stringify(chartWithSettings, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${tab.label}.piu.json`
        a.click()
        URL.revokeObjectURL(url)
        return
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
