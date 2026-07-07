import { useEffect, useCallback } from 'react'
import { get } from 'idb-keyval'
import { audioEngine } from '@/services/audioEngine'
import { pickFile, openAudioFile } from '@/services/fileActions'
import { useTabsStore } from '@/store/tabsStore'

export function useAudio() {
  const { tabs, activeTabId, setAudioBlob } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  useEffect(() => {
    if (!activeTabId) return
    const tab = tabs.find(t => t.id === activeTabId)
    if (!tab) return

    // Флаг отмены: IDB-get может разрешиться уже после переключения на другую
    // вкладку — без него в движок загрузилось бы аудио чужой вкладки.
    let cancelled = false
    if (tab.audioBlob) {
      audioEngine.loadBlob(tab.audioBlob)
    } else {
      get<Blob>(`audio:${activeTabId}`).then(blob => {
        if (cancelled || !blob) return
        setAudioBlob(activeTabId, blob, tab.chart.audioFileName ?? 'audio')
        audioEngine.loadBlob(blob)
      })
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  // Цепочка «стор + IndexedDB + декодирование» централизована в fileActions
  // (общая с drag&drop и PWA file_handlers).
  const openAudio = useCallback(() => pickFile('audio/*', openAudioFile), [])

  return {
    openAudio,
    audioFileName: activeTab?.chart.audioFileName,
  }
}
