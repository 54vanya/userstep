import { useEffect, useRef } from 'react'
import { audioEngine } from '@/services/audioEngine'
import { useEditorStore } from '@/store/editorStore'
import { countPassed } from '@/utils/noteCount'

// Полупрозрачное текущее число нот (combo-стиль) по центру поля поверх нот.
// Обновляется по RAF, без React-ререндеров каждый кадр. width — ширина зоны стрелок
// (cols*cw), чтобы число центрировалось по стрелкам, а не по всему контейнеру с рейлом;
// left — сдвиг поля при выравнивании по центру (View → Field alignment).
export function NoteCounterOverlay({ hitTimes, width, left = 0 }: { hitTimes: number[]; width: number; left?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let rafId: number
    let last = ''
    const tick = () => {
      const ms = audioEngine.isPlaying()
        ? audioEngine.getCurrentMs()
        : useEditorStore.getState().currentTime
      const text = String(countPassed(hitTimes, ms))
      if (text !== last && ref.current) {
        ref.current.textContent = text
        last = text
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [hitTimes])

  return (
    <div
      className="absolute top-8 bottom-0 flex items-center justify-center pointer-events-none z-30 select-none"
      style={{ width, left }}
    >
      <div
        ref={ref}
        className="font-extrabold tabular-nums text-foreground/40"
        style={{ fontSize: 68, lineHeight: 1, textShadow: '0 2px 8px rgba(0,0,0,0.35)' }}
      />
    </div>
  )
}
