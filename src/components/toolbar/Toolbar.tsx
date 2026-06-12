import { useState, useEffect, useMemo } from 'react'
import { audioEngine } from '@/services/audioEngine'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { parseUcs } from '@/services/ucsParser'
import { serializeToUcs } from '@/services/ucsSerializer'
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
  currentTime: number
  totalMs: number
}

function TimeDisplay({ currentTime, totalMs }: TimeDisplayProps) {
  const [liveMs, setLiveMs] = useState(currentTime)

  // Single persistent RAF loop — checks audioEngine.isPlaying() directly
  useEffect(() => {
    let rafId: number
    const tick = () => {
      if (audioEngine.isPlaying()) {
        setLiveMs(audioEngine.getCurrentMs())
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Sync display when scrubbing / seeking while paused
  useEffect(() => {
    if (!audioEngine.isPlaying()) {
      setLiveMs(currentTime)
    }
  }, [currentTime])

  return (
    <span
      data-testid="time-display"
      className="text-xs font-mono text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
    >
      {formatMs(liveMs)} / {formatMs(totalMs)}
    </span>
  )
}

export function Toolbar() {
  const { tabs, activeTabId, addTab, setTabScale, setTabPlaybackRate } = useTabsStore()
  const { isPlaying, currentTime, setPlaying, setCurrentTime, showColumnDividers, setShowColumnDividers } = useEditorStore()
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

  const handleImportUcs = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ucs'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        try {
          const chart = parseUcs(text)
          chart.meta.title = file.name.replace(/\.ucs$/i, '')
          addTab(chart, file.name.replace(/\.ucs$/i, ''))
        } catch {
          alert('Failed to parse UCS file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleExportUcs = () => {
    if (!activeTab) return
    const ucs = serializeToUcs(activeTab.chart)
    const blob = new Blob([ucs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab.label}.ucs`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSavePiu = () => {
    if (!activeTab) return
    const chartWithSettings = {
      ...activeTab.chart,
      editorSettings: {
        scale: activeTab.scale,
        playbackRate: activeTab.playbackRate,
        currentTime,
      },
    }
    const json = JSON.stringify(chartWithSettings, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab.label}.piu.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadPiu = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.piu.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const chart = JSON.parse(e.target?.result as string)
          const label = chart.meta?.title || file.name.replace(/\.piu\.json$|\.json$/, '')
          const tabId = addTab(chart, label)
          if (chart.editorSettings) {
            setTabScale(tabId, chart.editorSettings.scale)
            setTabPlaybackRate(tabId, chart.editorSettings.playbackRate)
            audioEngine.setPlaybackRate(chart.editorSettings.playbackRate)
            setCurrentTime(chart.editorSettings.currentTime)
          }
        } catch {
          alert('Failed to parse .piu.json file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="flex items-center gap-3 px-3 h-10 border-b border-border bg-card shrink-0 text-sm">
      <button
        onClick={handlePlayPause}
        disabled={!audioEngine.hasAudio()}
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

      <TimeDisplay currentTime={currentTime} totalMs={totalMs} />

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

      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showColumnDividers}
          onChange={e => setShowColumnDividers(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-xs text-muted-foreground">Col lines</span>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleImportUcs}
          className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
        >
          Import .ucs
        </button>
        <button
          onClick={handleLoadPiu}
          className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
        >
          Open .piu.json
        </button>
        <div className="w-px h-5 bg-border" />
        <button
          onClick={handleExportUcs}
          disabled={!activeTab}
          className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Export .ucs
        </button>
        <button
          onClick={handleSavePiu}
          disabled={!activeTab}
          className="px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Save .piu.json
        </button>
        {activeTab && (
          <>
            <div className="w-px h-5 bg-border" />
            <button
              onClick={openAudio}
              className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
            >
              {audioFileName ? audioFileName : 'Open Audio'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
