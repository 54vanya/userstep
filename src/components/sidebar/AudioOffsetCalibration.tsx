import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { computeHitTimes } from '@/utils/noteCount'
import { AUDIO_OFFSET_MIN, AUDIO_OFFSET_MAX } from '@/utils/viewSettings'

// Калибровка Audio offset под РЕАЛЬНЫЙ трек чарта (не синтетический метроном):
// проигрываем аудио с места чуть раньше первой ноты, пользователь жмёт любую
// клавишу/кликает по такту нот, а мы меряем разницу между временем удара
// (audioEngine.getCurrentMs() в момент удара) и ближайшим временем хита чарта.
// Эта разница ЕСТЬ искомый audioOffsetMs: наушники со звуковой задержкой L
// физически слышны на L позже «логической» позиции трека, поэтому и удар
// приходит на L позже (см. вывод в CLAUDE.md/комментариях usePlayback —
// тот же знак использует и визуальная синхронизация, и live-запись).
const TARGET_SAMPLES = 12
const MIN_SAMPLES = 4
const TOLERANCE_MS = 250
const LEAD_IN_MS = 3000

function nearestHitTime(hitTimes: number[], ms: number): number | null {
  if (hitTimes.length === 0) return null
  let lo = 0
  let hi = hitTimes.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (hitTimes[mid] < ms) lo = mid + 1
    else hi = mid
  }
  let best = hitTimes[lo]
  if (lo > 0 && Math.abs(hitTimes[lo - 1] - ms) < Math.abs(best - ms)) best = hitTimes[lo - 1]
  return best
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

type Phase = 'idle' | 'running' | 'insufficient' | 'done'

interface Props {
  onClose: () => void
}

export function AudioOffsetCalibration({ onClose }: Props) {
  const { tabs, activeTabId } = useTabsStore()
  const setAudioOffsetMs = useEditorStore(s => s.setAudioOffsetMs)
  const activeTab = tabs.find(t => t.id === activeTabId)

  const hitTimes = useMemo(
    () => (activeTab ? computeHitTimes(activeTab.chart.blocks) : []),
    [activeTab?.chart.blocks],
  )
  const audioReady = audioEngine.hasAudio()
  const canCalibrate = audioReady && hitTimes.length > 0

  const [phase, setPhase] = useState<Phase>('idle')
  const [attempts, setAttempts] = useState(0)
  const [matched, setMatched] = useState(0)
  const [resultMs, setResultMs] = useState(0)
  const samplesRef = useRef<number[]>([])
  const attemptsRef = useRef(0)

  const stop = useCallback(() => {
    audioEngine.pause()
    const samples = samplesRef.current
    if (samples.length >= MIN_SAMPLES) {
      setResultMs(Math.round(median(samples)))
      setPhase('done')
    } else {
      setPhase('insufficient')
    }
  }, [])

  // Останов по концу трека — досчитываем что успели поймать.
  useEffect(() => {
    if (phase !== 'running') return
    audioEngine.on('end', stop)
    return () => audioEngine.off('end', stop)
  }, [phase, stop])

  const start = useCallback(() => {
    if (!canCalibrate) return
    samplesRef.current = []
    attemptsRef.current = 0
    setAttempts(0)
    setMatched(0)
    setPhase('running')
    audioEngine.play(Math.max(0, hitTimes[0] - LEAD_IN_MS))
  }, [canCalibrate, hitTimes])

  const registerTap = useCallback(() => {
    if (phase !== 'running') return
    const ms = audioEngine.getCurrentMs()
    const nearest = nearestHitTime(hitTimes, ms)
    attemptsRef.current += 1
    setAttempts(attemptsRef.current)
    if (nearest === null) return
    const delta = ms - nearest
    if (Math.abs(delta) <= TOLERANCE_MS) {
      samplesRef.current.push(delta)
      setMatched(samplesRef.current.length)
      if (samplesRef.current.length >= TARGET_SAMPLES) stop()
    }
  }, [phase, hitTimes, stop])

  // Esc закрывает модалку; capture + stopPropagation — как у остальных модалок
  // (ChartInfoModal/ShortcutsModal), иначе глобальные шорткаты ChartEditor
  // (Space=play/pause, клавиши-колонки=live-запись) сработали бы поверх калибровки.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        if (phase === 'running') audioEngine.pause()
        onClose()
        return
      }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      registerTap()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase, onClose, registerTap])

  useEffect(() => () => {
    // Если модалку закрыли посреди прогона — не оставляем трек играть фоном.
    if (phase === 'running') audioEngine.pause()
  }, [phase])

  const apply = () => {
    setAudioOffsetMs(Math.min(AUDIO_OFFSET_MAX, Math.max(AUDIO_OFFSET_MIN, resultMs)))
    onClose()
  }

  const retry = () => {
    samplesRef.current = []
    attemptsRef.current = 0
    setAttempts(0)
    setMatched(0)
    setPhase('idle')
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-[360px] max-w-[92vw] flex flex-col text-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border font-medium">Calibrate audio offset</div>
        <div className="px-4 py-3 space-y-3">
          {!canCalibrate && (
            <p className="text-xs text-muted-foreground">
              Needs an audio file and at least one note in the active tab.
            </p>
          )}

          {canCalibrate && phase === 'idle' && (
            <>
              <p className="text-xs text-muted-foreground">
                The track will play from just before the first note. Press any key (or click the
                button below) in time with the notes — we'll measure your average timing and turn
                it into an offset.
              </p>
              <button
                onClick={start}
                className="w-full px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
              >
                Start
              </button>
            </>
          )}

          {phase === 'running' && (
            <>
              <p className="text-xs text-muted-foreground">
                Tap along with the notes. Matched {matched}/{TARGET_SAMPLES} (taps: {attempts}).
              </p>
              <button
                onClick={registerTap}
                className="w-full h-20 rounded bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity select-none"
              >
                TAP
              </button>
              <button
                onClick={stop}
                className="w-full px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
              >
                Stop &amp; use what we caught
              </button>
            </>
          )}

          {phase === 'insufficient' && (
            <>
              <p className="text-xs text-muted-foreground">
                Not enough taps landed near a note ({matched}/{MIN_SAMPLES} needed). Try again,
                ideally on a section with a clear, steady beat.
              </p>
              <button
                onClick={retry}
                className="w-full px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
              >
                Retry
              </button>
            </>
          )}

          {phase === 'done' && (
            <>
              <p className="text-xs text-muted-foreground">
                Measured offset: <span className="font-mono text-foreground">{resultMs >= 0 ? '+' : ''}{resultMs}ms</span>
                {' '}(from {matched} matched taps).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={apply}
                  className="flex-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
                >
                  Apply
                </button>
                <button
                  onClick={retry}
                  className="flex-1 px-3 py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
                >
                  Retry
                </button>
              </div>
            </>
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
