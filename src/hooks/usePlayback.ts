import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { computeBlockOffsets, msToScrollY } from '@/utils/timing'
import type { BlockLayout } from '@/utils/geometry'
import type { Block } from '@/types/chart'

interface PlaybackOptions {
  // Слой, который физически двигается transform'ом (position:relative content wrapper).
  contentRef: React.RefObject<HTMLDivElement | null>
  // Текущая позиция воспроизведения в координатах чарта (px). Пишется каждый кадр,
  // читается hit-test'ом/подсветкой во время playback (scrollTop заморожен).
  playbackYRef: React.MutableRefObject<number>
}

export function usePlayback(
  blocks: Block[],
  blockLayouts: BlockLayout[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  { contentRef, playbackYRef }: PlaybackOptions,
) {
  const { isPlaying, setPlaying, setCurrentTime } = useEditorStore()
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const onEnd = () => {
      setCurrentTime(audioEngine.getCurrentMs())
      setPlaying(false)
    }
    audioEngine.on('end', onEnd)
    return () => audioEngine.off('end', onEnd)
  }, [setPlaying, setCurrentTime])

  useEffect(() => {
    if (!isPlaying) return
    const content = contentRef.current
    const scroller = scrollRef.current
    if (!content || !scroller) return

    const offsets = computeBlockOffsets(blocks)
    // Замораживаем нативный scrollTop; всё движение — через transform на content-слое.
    // will-change промоутит слой на старте Play и НЕ снимается на паузе (cleanup),
    // чтобы возврат из паузы был тёплым. Постоянно (в idle) держать его на огромном
    // totalHeight-слое нельзя — это ухудшает стационар.
    const baseS = scroller.scrollTop
    content.style.willChange = 'transform'

    // AudioContext.currentTime тикает грубее кадров дисплея (порциями по аудио-
    // квантам ~10–20мс). Если брать его напрямую каждый кадр, y «лестничный» и
    // движение выглядит рывками, хотя RAF честно идёт на полной частоте.
    // Поэтому ведём время сами по гладкому клоку RAF, а к аудио-часам мягко
    // подтягиваемся (low-pass), чтобы не уплывать от музыки.
    let smoothMs = audioEngine.getCurrentMs()
    let lastT = performance.now()
    // Постоянная времени подтяжки к аудио-часам. Коррекция масштабируется по
    // реальному dt (k = 1 - e^(-dt/τ)), поэтому НЕ зависит от частоты кадров —
    // одинаково мягко и на 100Гц, и на 120Гц/ProMotion с плавающим refresh.
    const SYNC_TAU_MS = 150
    const HARD_RESYNC_MS = 80   // рывок (seek/пауза/затык) — жёсткий ресинк

    const tick = (now: number) => {
      const rate = audioEngine.getPlaybackRate()
      const audioMs = audioEngine.getCurrentMs()
      const dt = Math.max(0, now - lastT)
      lastT = now

      // Продвигаемся на реально прошедшее время (гладко), затем подтягиваемся к
      // аудио-часам с частотно-независимым коэффициентом.
      let predicted = smoothMs + dt * rate
      const drift = audioMs - predicted
      if (Math.abs(drift) > HARD_RESYNC_MS) {
        predicted = audioMs
      } else {
        const k = 1 - Math.exp(-dt / SYNC_TAU_MS)
        predicted += drift * k
      }
      smoothMs = predicted

      const y = msToScrollY(predicted, offsets, blockLayouts)
      playbackYRef.current = y
      // Sub-pixel + GPU-композитинг, без reflow и scroll-событий.
      content.style.transform = `translate3d(0, ${baseS - y}px, 0)`
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      const y = playbackYRef.current
      // transform обязательно снимаем (дальше работает нативный скролл), но
      // will-change НЕ трогаем — пусть слой остаётся промоутнутым, чтобы возврат
      // из паузы не платил за повторное создание/растр холодного слоя.
      content.style.transform = ''
      // Передаём позицию нативному скроллу: его onScroll пересинхронит currentTime.
      scroller.scrollTop = y
    }
  }, [isPlaying, blocks, blockLayouts, scrollRef, contentRef, playbackYRef])
}
