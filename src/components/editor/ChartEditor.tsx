import { useEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { ChartGrid } from './ChartGrid'
import { WelcomeScreen } from './WelcomeScreen'
import { useHitSounds } from '@/hooks/useHitSounds'

// Поле ввода текста (где пробел/горячие клавиши должны работать как обычно), в
// отличие от управляющих контролов вроде range/checkbox/button — на них пробел
// обязан доставаться play/pause (см. инвариант тулбара в onKeyDown ниже).
const TEXT_INPUT_TYPES = ['text', 'number', 'search', 'email', 'url', 'tel', 'password']
function isTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.includes((el as HTMLInputElement).type)
  return false
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
