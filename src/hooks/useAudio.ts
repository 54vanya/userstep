import { useEffect, useCallback } from 'react'
import { get, set } from 'idb-keyval'
import { audioEngine } from '@/services/audioEngine'
import { useTabsStore } from '@/store/tabsStore'

export function useAudio() {
  const { tabs, activeTabId, setAudioBlob } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  useEffect(() => {
    if (!activeTabId) return
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return

    if (tab.audioBlob) {
      audioEngine.loadBlob(tab.audioBlob)
    } else {
      get<Blob>(`audio:${activeTabId}`).then(blob => {
        if (blob) {
          setAudioBlob(activeTabId, blob, tab.chart.audioFileName ?? 'audio')
          audioEngine.loadBlob(blob)
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  const openAudio = useCallback(() => {
    if (!activeTabId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      setAudioBlob(activeTabId, file, file.name)
      set(`audio:${activeTabId}`, file)
      audioEngine.loadBlob(file)
    }
    input.click()
  }, [activeTabId, setAudioBlob])

  return {
    openAudio,
    audioFileName: activeTab?.chart.audioFileName,
  }
}
