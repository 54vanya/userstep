import { useEffect } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { useTabsStore } from '@/store/tabsStore'
import { audioEngine } from '@/services/audioEngine'
import { computeHitSounds, hitSoundFreq } from '@/utils/hitSounds'

// Озвучка нот, прилетающих к верхней черте (курсору), во время воспроизведения.
// Планирование с упреждением: каждые ~40мс ставим бипы на горизонт LOOKAHEAD вперёд
// в точные моменты AudioContext-времени — это устраняет дрожание RAF/таймера, бип
// звучит ровно в момент совпадения ноты с курсором.
export function useHitSounds() {
  const hitSounds = useEditorStore(s => s.hitSounds)
  const isPlaying = useEditorStore(s => s.isPlaying)
  const tabs = useTabsStore(s => s.tabs)
  const activeTabId = useTabsStore(s => s.activeTabId)
  const blocks = tabs.find(t => t.id === activeTabId)?.chart.blocks

  useEffect(() => {
    if (!hitSounds || !isPlaying || !blocks) return
    const events = computeHitSounds(blocks)
    if (events.length === 0) return

    // Горизонт планирования: должен превышать интервал таймера (40мс) с запасом на
    // дрожание, но держим небольшим — иначе после паузы успел бы прозвучать «хвост»
    // уже запланированных бипов.
    const LOOKAHEAD_MS = 70
    // Индекс первого ещё не запланированного события — стартуем от текущей позиции,
    // чтобы не «выстрелить» все прошедшие бипы разом.
    let idx = 0
    const start = audioEngine.getCurrentMs()
    while (idx < events.length && events[idx].ms < start - 1) idx++

    const schedule = () => {
      const horizon = audioEngine.getCurrentMs() + LOOKAHEAD_MS
      while (idx < events.length && events[idx].ms <= horizon) {
        const ev = events[idx++]
        const at = audioEngine.msToCtxTime(ev.ms)
        if (at != null) audioEngine.scheduleBeep(hitSoundFreq(ev.q), at)
      }
    }
    schedule()
    const timer = window.setInterval(schedule, 40)
    return () => window.clearInterval(timer)
  }, [hitSounds, isPlaying, blocks])
}
