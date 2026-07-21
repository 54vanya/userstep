import { memo, useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import {
  Undo2, Redo2, BoxSelect, Trash2,
  Copy, Scissors, ClipboardPaste,
  FlipHorizontal2, FlipVertical2, RotateCw,
} from 'lucide-react'
import { audioEngine } from '@/services/audioEngine'
import { togglePlayback } from '@/services/playbackControl'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { useAudio } from '@/hooks/useAudio'
import {
  undoEdit, redoEdit, selectBlockAtCursor,
  copySel, cutSel, pasteSel, deleteSel, flipSel,
} from '@/services/editActions'
import { hasClipboard } from '@/services/selectionOps'
import { shortcutLabel } from '@/utils/shortcuts'
import { computeBlockOffsets, formatMs } from '@/utils/timing'
import { blockRowCount, MAX_SCALE, MIN_SCALE } from '@/utils/geometry'
import { computeHitTimes, countPassed } from '@/utils/noteCount'
import { FIELD_ZOOM_MIN, FIELD_ZOOM_MAX, FIELD_ZOOM_STEP, AUDIO_OFFSET_MIN, AUDIO_OFFSET_MAX, AUDIO_OFFSET_STEP } from '@/utils/viewSettings'
import { AudioOffsetCalibration } from './AudioOffsetCalibration'

// Левый сайдбар — бывший тулбар: play, время, счётчик нот, слайдеры Scale/Zoom/
// Rush/Volume, чекбоксы звукового ассиста, кнопка аудио-файла. Метаданные чарта
// (Title/Artist/Level/Mode) живут в модалке File → Chart info (ChartInfoModal).

// Персистентный RAF, пишущий текст позиции напрямую в DOM (textContent) — без
// React-ререндеров каждый кадр. Playback → audioEngine; скраб/пауза → editorStore.
// Цифры незачем гонять на 120fps — обновление ~раз в 33мс освобождает бюджет
// кадра для плавной анимации чарта.
function useRafTextRef(compute: (ms: number) => string) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let rafId: number
    let lastText = ''
    let lastUpdate = 0
    const tick = (now: number) => {
      if (now - lastUpdate >= 33) {
        lastUpdate = now
        const ms = audioEngine.isPlaying()
          ? audioEngine.getCurrentMs()
          : useEditorStore.getState().currentTime
        const text = compute(ms)
        if (text !== lastText && ref.current) {
          ref.current.textContent = text
          lastText = text
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [compute])
  return ref
}

function TimeDisplay({ totalMs }: { totalMs: number }) {
  const ref = useRafTextRef(
    useCallback((ms: number) => `${formatMs(ms)} / ${formatMs(totalMs)}`, [totalMs]),
  )
  return (
    <span
      ref={ref}
      data-testid="time-display"
      className="text-xs font-mono text-muted-foreground tabular-nums whitespace-nowrap shrink-0"
    />
  )
}

// Счётчик нот «пройдено / всего». В конце трека числа сравниваются.
function NoteCountDisplay({ hitTimes }: { hitTimes: number[] }) {
  const ref = useRafTextRef(
    useCallback((ms: number) => String(countPassed(hitTimes, ms)), [hitTimes]),
  )
  const total = hitTimes.length
  // Резервируем ширину «пройдено» под число разрядов общего количества, чтобы при
  // переходе через 999→1000 (когда total > 999) счётчик не дёргал «/ total».
  const passedWidthCh = String(total).length
  return (
    <span className="text-xs font-mono text-muted-foreground tabular-nums whitespace-nowrap shrink-0" title="Notes passed / total">
      ♪ <span ref={ref} className="inline-block text-right" style={{ minWidth: `${passedWidthCh}ch` }} /> / {total}
    </span>
  )
}

// Кнопка-иконка раздела Edit: та же стилистика, что у кнопки сброса Rush.
function EditButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 flex-1 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
    >
      {children}
    </button>
  )
}

// Раздел Edit: undo/redo и операции над выделением, ранее доступные только с
// клавиатуры. Кнопки зовут те же editActions, что и шорткаты. memo: Sidebar
// ре-рендерится на каждый тик Scale-слайдера, а этому разделу scale безразличен —
// без memo десяток кнопок с иконками рендерился бы на каждый тик впустую.
const EditSection = memo(function EditSection({ hasTab }: { hasTab: boolean }) {
  const selection = useEditorStore(s => s.selection)
  // Счётчик копирований — единственный реактивный сигнал о содержимом клипборда:
  // подписка даёт ре-рендер после copy/cut, сам флаг читается свежим вызовом.
  useEditorStore(s => s.clipVersion)
  const canUndo = useStore(useTabsStore.temporal, s => s.pastStates.length > 0)
  const canRedo = useStore(useTabsStore.temporal, s => s.futureStates.length > 0)
  const hasSel = hasTab && selection !== null
  const canPaste = hasTab && hasClipboard()

  const icon = 14
  return (
    <div className="px-3 py-2 border-b border-border">
      <div className="flex gap-0.5">
        <EditButton title={`Undo (${shortcutLabel('Ctrl+Z')})`} onClick={undoEdit} disabled={!canUndo}>
          <Undo2 size={icon} />
        </EditButton>
        <EditButton title={`Redo (${shortcutLabel('Ctrl+Y')})`} onClick={redoEdit} disabled={!canRedo}>
          <Redo2 size={icon} />
        </EditButton>
        <EditButton title={`Select block at cursor (${shortcutLabel('Ctrl+A')})`} onClick={selectBlockAtCursor} disabled={!hasTab}>
          <BoxSelect size={icon} />
        </EditButton>
        <EditButton title="Delete selection (Del)" onClick={deleteSel} disabled={!hasSel}>
          <Trash2 size={icon} />
        </EditButton>
      </div>
      <div className="flex gap-0.5 mt-0.5">
        <EditButton title={`Copy selection (${shortcutLabel('Ctrl+C')})`} onClick={() => copySel()} disabled={!hasSel}>
          <Copy size={icon} />
        </EditButton>
        <EditButton title={`Cut selection (${shortcutLabel('Ctrl+X')})`} onClick={cutSel} disabled={!hasSel}>
          <Scissors size={icon} />
        </EditButton>
        <EditButton
          title={`Paste at selection or cursor (${shortcutLabel('Ctrl+V')}); Shift+click — shift columns (${shortcutLabel('Ctrl+Shift+V')})`}
          onClick={e => pasteSel(e.shiftKey)}
          disabled={!canPaste}
        >
          <ClipboardPaste size={icon} />
        </EditButton>
      </div>
      <div className="flex gap-0.5 mt-0.5">
        <EditButton title="Flip horizontal (X)" onClick={() => flipSel('h')} disabled={!hasSel}>
          <FlipHorizontal2 size={icon} />
        </EditButton>
        <EditButton title="Flip vertical (Y)" onClick={() => flipSel('v')} disabled={!hasSel}>
          <FlipVertical2 size={icon} />
        </EditButton>
        <EditButton title="Mirror — flip both (M)" onClick={() => flipSel('m')} disabled={!hasSel}>
          <RotateCw size={icon} />
        </EditButton>
      </div>
    </div>
  )
})

// Строка слайдера: подпись + значение над полноширинным range-инпутом.
function SliderRow({
  label,
  value,
  extra,
  children,
}: {
  label: string
  value: string
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
        <span>{label}</span>
        <span className="ml-auto tabular-nums">{value}</span>
        {extra}
      </div>
      {children}
    </div>
  )
}

export function Sidebar() {
  const { tabs, activeTabId, setTabPlaybackRate } = useTabsStore()
  // По-полевые подписки: подписка на весь стор (с currentTime) ререндерила бы
  // весь сайдбар на каждый тик скролла/скраба; currentTime читается через
  // getState() в RAF-дисплеях.
  const isPlaying = useEditorStore(s => s.isPlaying)
  const fieldZoom = useEditorStore(s => s.fieldZoom)
  const setFieldZoom = useEditorStore(s => s.setFieldZoom)
  const rhythmColoring = useEditorStore(s => s.rhythmColoring)
  const setRhythmColoring = useEditorStore(s => s.setRhythmColoring)
  const hitSounds = useEditorStore(s => s.hitSounds)
  const setHitSounds = useEditorStore(s => s.setHitSounds)
  const metronome = useEditorStore(s => s.metronome)
  const setMetronome = useEditorStore(s => s.setMetronome)
  const musicVolume = useEditorStore(s => s.musicVolume)
  const setMusicVolume = useEditorStore(s => s.setMusicVolume)
  const audioOffsetMs = useEditorStore(s => s.audioOffsetMs)
  const setAudioOffsetMs = useEditorStore(s => s.setAudioOffsetMs)
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Тики слайдера Scale применяются раз в кадр (rAF), как у Ctrl+колеса:
  // input-события могут приходить чаще кадров, а каждый setTabScale — это
  // рендер скелета грида + пересчёт стилей. Берётся последнее значение.
  const pendingScaleRef = useRef<number | null>(null)
  const scaleRafRef = useRef(0)
  const onScaleChange = useCallback((value: number) => {
    pendingScaleRef.current = value
    if (scaleRafRef.current) return
    scaleRafRef.current = requestAnimationFrame(() => {
      scaleRafRef.current = 0
      const { activeTabId, setTabScale } = useTabsStore.getState()
      if (activeTabId && pendingScaleRef.current !== null) setTabScale(activeTabId, pendingScaleRef.current)
      pendingScaleRef.current = null
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(scaleRafRef.current), [])

  const totalMs = useMemo(() => {
    if (!activeTab) return 0
    const blocks = activeTab.chart.blocks
    const offsets = computeBlockOffsets(blocks)
    if (offsets.length === 0) return 0
    const last = offsets[offsets.length - 1]
    return last.startMs + blockRowCount(blocks[blocks.length - 1]) * last.msPerRow
  }, [activeTab?.chart.blocks])
  // Отсортированные времена всех «хитов». Хит — это строка (момент времени), где
  // есть хотя бы одна активная ячейка: tap, голова/тело/хвост холда (холд даёт хит
  // на КАЖДУЮ занятую строку). Ноты в одной строке (разные колонки) = один хит.
  const hitTimes = useMemo(
    () => (activeTab ? computeHitTimes(activeTab.chart.blocks) : []),
    [activeTab?.chart.blocks],
  )

  const { openAudio, audioFileName } = useAudio()

  // hasAudio() не реактивен, а декод аудио (loadBlob) асинхронный — без этого
  // кнопка Play на старте остаётся выключенной до случайного ре-рендера.
  // Подписываемся на событие загрузки и пере-проверяем при смене вкладки.
  const [audioReady, setAudioReady] = useState(() => audioEngine.hasAudio())
  const [showCalibration, setShowCalibration] = useState(false)
  useEffect(() => {
    const refresh = () => setAudioReady(audioEngine.hasAudio())
    audioEngine.on('load', refresh)
    refresh()
    return () => audioEngine.off('load', refresh)
  }, [activeTabId])

  // Применяем громкость музыки к движку: на mount (восстановление сохранённого
  // значения) и при каждом изменении. setVolume не создаёт AudioContext заранее.
  useEffect(() => {
    audioEngine.setVolume(musicVolume)
  }, [musicVolume])

  const scale = activeTab?.scale ?? 3
  const playbackRate = activeTab?.playbackRate ?? 1.0

  return (
    <div className="w-56 border-r border-border bg-card flex flex-col shrink-0 overflow-y-auto text-sm">
      <div className="px-3 py-2 flex items-center gap-2.5 border-b border-border">
        <button
          onClick={togglePlayback}
          disabled={!audioReady}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
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
        <div className="flex flex-col min-w-0">
          <TimeDisplay totalMs={totalMs} />
          <NoteCountDisplay hitTimes={hitTimes} />
        </div>
      </div>

      <EditSection hasTab={!!activeTab} />

      <div className="px-3 py-2.5 space-y-2.5 border-b border-border">
        <SliderRow
          label="Rush"
          value={`×${playbackRate.toFixed(1)}`}
          extra={
            <button
              onClick={() => {
                if (activeTabId) setTabPlaybackRate(activeTabId, 1.0)
                audioEngine.setPlaybackRate(1.0)
              }}
              disabled={playbackRate === 1.0}
              title="Reset rush to ×1.0"
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 8a5 5 0 1 1 1.6 3.7" strokeLinecap="round" />
                <path d="M3 4.5 V8 H6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        >
          <input
            type="range"
            min={0.2}
            max={2}
            step={0.1}
            value={playbackRate}
            onChange={e => {
              const rate = parseFloat(e.target.value)
              if (activeTabId) setTabPlaybackRate(activeTabId, rate)
              audioEngine.setPlaybackRate(rate)
            }}
            onMouseUp={e => e.currentTarget.blur()}
            className="w-full accent-primary"
          />
        </SliderRow>

        <SliderRow label="Scale" value={scale.toFixed(1)}>
          <input
            type="range"
            min={MIN_SCALE}
            max={MAX_SCALE}
            step={0.1}
            value={scale}
            onChange={e => onScaleChange(parseFloat(e.target.value))}
            onMouseUp={e => e.currentTarget.blur()}
            className="w-full accent-primary"
          />
        </SliderRow>

        <SliderRow label="Zoom" value={`${fieldZoom}%`}>
          <input
            type="range"
            min={FIELD_ZOOM_MIN}
            max={FIELD_ZOOM_MAX}
            step={FIELD_ZOOM_STEP}
            value={fieldZoom}
            onChange={e => setFieldZoom(parseInt(e.target.value, 10))}
            onMouseUp={e => e.currentTarget.blur()}
            className="w-full accent-primary"
          />
        </SliderRow>

        <SliderRow label="Volume" value={`${Math.round(musicVolume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={musicVolume}
            onChange={e => setMusicVolume(parseFloat(e.target.value))}
            onMouseUp={e => e.currentTarget.blur()}
            className="w-full accent-primary"
            title="Music volume (does not affect hit sounds)"
          />
        </SliderRow>

        <SliderRow
          label="Audio offset"
          value={`${audioOffsetMs >= 0 ? '+' : ''}${audioOffsetMs}ms`}
          extra={
            <button
              onClick={() => setAudioOffsetMs(0)}
              disabled={audioOffsetMs === 0}
              title="Reset audio offset to 0ms"
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 8a5 5 0 1 1 1.6 3.7" strokeLinecap="round" />
                <path d="M3 4.5 V8 H6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          }
        >
          <input
            type="range"
            min={AUDIO_OFFSET_MIN}
            max={AUDIO_OFFSET_MAX}
            step={AUDIO_OFFSET_STEP}
            value={audioOffsetMs}
            onChange={e => setAudioOffsetMs(parseInt(e.target.value, 10))}
            onMouseUp={e => e.currentTarget.blur()}
            className="w-full accent-primary"
            title="Compensate output latency (e.g. Bluetooth headphones): shifts note scroll and live keyboard input to match the sound you actually hear. Positive = audio arrives late."
          />
          <button
            onClick={() => setShowCalibration(true)}
            disabled={!activeTab || !audioReady}
            title="Measure the offset by tapping along to this chart's own track"
            className="mt-1 w-full px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors disabled:opacity-40 disabled:hover:bg-secondary"
          >
            Calibrate…
          </button>
        </SliderRow>
      </div>

      {showCalibration && <AudioOffsetCalibration onClose={() => setShowCalibration(false)} />}

      <div className="px-3 py-2.5 space-y-1.5 border-b border-border">
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
          title="Color notes by rhythm beat (like in StepMania)"
        >
          <input
            type="checkbox"
            checked={rhythmColoring}
            onChange={e => setRhythmColoring(e.target.checked)}
            className="accent-primary"
          />
          Note colors
        </label>

        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
          title="Beep when notes reach the top line during playback (pitch varies by rhythm)"
        >
          <input
            type="checkbox"
            checked={hitSounds}
            onChange={e => setHitSounds(e.target.checked)}
            className="accent-primary"
          />
          Hit sounds
        </label>

        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
          title="Tick on every beat during playback (accented on measure start)"
        >
          <input
            type="checkbox"
            checked={metronome}
            onChange={e => setMetronome(e.target.checked)}
            className="accent-primary"
          />
          Metronome
        </label>
      </div>

      {activeTab && (
        <div className="px-3 py-2.5">
          <button
            onClick={openAudio}
            className="w-full px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors truncate"
            title={audioFileName ?? 'Open an audio file for this chart'}
          >
            {audioFileName ? audioFileName : 'Open Audio'}
          </button>
        </div>
      )}
    </div>
  )
}
