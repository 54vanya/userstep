import { useRef, useEffect, useMemo, useState } from 'react'
import { audioEngine } from '@/services/audioEngine'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { useAudio } from '@/hooks/useAudio'
import { computeBlockOffsets } from '@/utils/timing'
import { blockRowCount } from '@/utils/geometry'

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const m = Math.floor(total / 60000)
  const s = Math.floor((total % 60000) / 1000)
  const milli = total % 1000
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}

interface TimeDisplayProps {
  totalMs: number
}

function TimeDisplay({ totalMs }: TimeDisplayProps) {
  const ref = useRef<HTMLSpanElement>(null)

  // Единый персистентный RAF, пишет напрямую в DOM (textContent) — без React-
  // ререндеров каждый кадр. Playback → audioEngine; скраб/пауза → editorStore.
  useEffect(() => {
    let rafId: number
    let lastText = ''
    let lastUpdate = 0
    const tick = (now: number) => {
      // Цифры мс незачем гонять на 120fps — обновляем ~раз в 33мс, освобождая
      // бюджет кадра для плавной анимации чарта.
      if (now - lastUpdate >= 33) {
        lastUpdate = now
        const ms = audioEngine.isPlaying()
          ? audioEngine.getCurrentMs()
          : useEditorStore.getState().currentTime
        const text = `${formatMs(ms)} / ${formatMs(totalMs)}`
        if (text !== lastText && ref.current) {
          ref.current.textContent = text
          lastText = text
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [totalMs])

  return (
    <span
      ref={ref}
      data-testid="time-display"
      className="text-xs font-mono text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
    />
  )
}

export function Toolbar() {
  const { tabs, activeTabId, setTabScale, setTabPlaybackRate } = useTabsStore()
  const { isPlaying, currentTime, setPlaying, setCurrentTime } = useEditorStore()
  const activeTab = tabs.find(t => t.id === activeTabId)

  const totalMs = useMemo(() => {
    if (!activeTab) return 0
    const blocks = activeTab.chart.blocks
    const offsets = computeBlockOffsets(blocks)
    if (offsets.length === 0) return 0
    const last = offsets[offsets.length - 1]
    return last.startMs + blockRowCount(blocks[blocks.length - 1]) * last.msPerRow
  }, [activeTab?.chart.blocks])
  const { openAudio, audioFileName } = useAudio()

  // hasAudio() не реактивен, а декод аудио (loadBlob) асинхронный — без этого
  // кнопка Play на старте остаётся выключенной до случайного ре-рендера.
  // Подписываемся на событие загрузки и пере-проверяем при смене вкладки.
  const [audioReady, setAudioReady] = useState(() => audioEngine.hasAudio())
  useEffect(() => {
    const refresh = () => setAudioReady(audioEngine.hasAudio())
    audioEngine.on('load', refresh)
    refresh()
    return () => audioEngine.off('load', refresh)
  }, [activeTabId])

  const scale = activeTab?.scale ?? 3
  const playbackRate = activeTab?.playbackRate ?? 1.0

  const handlePlayPause = () => {
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
  }

  return (
    <div className="flex items-center gap-3 px-3 h-10 border-b border-border bg-card shrink-0 text-sm">
      <button
        onClick={handlePlayPause}
        disabled={!audioReady}
        className="w-7 h-7 flex items-center justify-center rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="1" y="1" width="4" height="10" rx="1"/>
            <rect x="7" y="1" width="4" height="10" rx="1"/>
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 1.5l9 4.5-9 4.5z"/>
          </svg>
        )}
      </button>

      <TimeDisplay totalMs={totalMs} />

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Scale</span>
        <input
          type="range"
          min={1}
          max={10}
          step={0.1}
          value={scale}
          onChange={e => activeTabId && setTabScale(activeTabId, parseFloat(e.target.value))}
          onMouseUp={e => e.currentTarget.blur()}
          className="w-24 accent-primary"
        />
        <span className="text-xs text-muted-foreground w-8">{scale.toFixed(1)}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Speed</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.1}
          value={playbackRate}
          onChange={e => {
            const rate = parseFloat(e.target.value)
            if (activeTabId) setTabPlaybackRate(activeTabId, rate)
            audioEngine.setPlaybackRate(rate)
          }}
          onMouseUp={e => e.currentTarget.blur()}
          className="w-20 accent-primary"
        />
        <span className="text-xs text-muted-foreground w-6">×{playbackRate.toFixed(1)}</span>
      </div>

      {activeTab && (
        <button
          onClick={openAudio}
          className="ml-auto px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors max-w-48 truncate"
        >
          {audioFileName ? audioFileName : 'Open Audio'}
        </button>
      )}
    </div>
  )
}
