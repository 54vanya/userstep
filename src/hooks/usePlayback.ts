import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { computeBlockOffsets, msToScrollY } from '@/utils/timing'
import type { BlockLayout } from '@/utils/geometry'
import type { Block } from '@/types/chart'

interface PlaybackOptions {
  // Слой, который физически двигается transform'ом (position:relative content wrapper).
  contentRef: React.RefObject<HTMLDivElement | null>
  // Под-слой сетки внутри contentRef. В режиме pixel-snap получает контр-трансформ
  // на дробный остаток (сетка на физических пикселях, ноты — сабпиксельно).
  gridRef: React.RefObject<HTMLDivElement | null>
  // Текущая позиция воспроизведения в координатах чарта (px). Пишется каждый кадр,
  // читается hit-test'ом/подсветкой во время playback (scrollTop заморожен).
  playbackYRef: React.MutableRefObject<number>
}

export function usePlayback(
  blocks: Block[],
  blockLayouts: BlockLayout[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  { contentRef, gridRef, playbackYRef }: PlaybackOptions,
) {
  const { isPlaying, setPlaying, setCurrentTime, playbackMode, playbackFpsCap, audioOffsetMs } = useEditorStore()
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

    // smooth/snap: позиция — ЧИСТО линейная функция таймстампа кадра `now` от якоря
    // (anchorMs в момент anchorPerf), ровно как в anim-test.html, где плавность
    // идеальна всегда: каждый кадр рисует позицию, точно соответствующую своему
    // таймстампу, поэтому даже при плавающем ProMotion-refresh движение ровное.
    // Аудио задаёт ТОЛЬКО якорь и скорость (rate); пер-кадровой подтяжки к
    // квантованным аудио-часам НЕТ — именно она впрыскивала рябь скорости и делала
    // результат зависимым от фазы старта. Ре-якорь — только на разрыве (см. ниже).
    let anchorPerf = -1                 // perf-таймстамп якоря (ставится на 1-м кадре)
    let anchorMs = 0                    // позиция (мс) в момент якоря
    let anchorRate = audioEngine.getPlaybackRate()
    // framelock использует свой накопитель + мягкую подтяжку (оставлен для сравнения).
    let smoothMs = audioEngine.getCurrentMs()
    let lastT = performance.now()
    const SYNC_TAU_MS = 150             // постоянная времени подтяжки (только framelock)
    // Порог жёсткого ре-якоря: seek/пауза/затык/throttle вкладки дают разрыв > порога →
    // переякориваемся на аудио-часы. В обычном ходе дрейф perf.now↔аудио ppm-уровня
    // (несколько мс за всю песню) и порога не достигает — линия остаётся гладкой.
    const HARD_RESYNC_MS = 80

    // frame-lock: оценка интервала кадра (медиана последних 60), чтобы шагать
    // фиксированно на refresh×rate за кадр, а не на дрожащий dt.
    const intervals: number[] = []
    const refreshMs = () => {
      if (intervals.length < 5) return 1000 / 60
      const s = [...intervals].sort((a, b) => a - b)
      return s[s.length >> 1]
    }

    // Кап 60 FPS: на high-refresh дисплеях (ProMotion 120Гц) рендерим каждый
    // второй кадр — 60fps-захват видео попадает на равномерные позиции, без
    // биений 120Гц-рендера с 60Гц-записью. Позиция по-прежнему линейна от
    // таймстампа отрисованного кадра, так что движение остаётся ровным.
    // Допуск ~1мс — чтобы джиттер таймстампов не заставлял ждать лишний кадр.
    const FPS_CAP_MS = 1000 / 60
    let lastRenderT = -Infinity

    const tick = (now: number) => {
      if (playbackFpsCap && now - lastRenderT < FPS_CAP_MS - 1) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      lastRenderT = now
      const rate = audioEngine.getPlaybackRate()
      const audioMs = audioEngine.getCurrentMs()
      const dt = Math.max(0, now - lastT)
      lastT = now
      if (dt > 0 && dt < 200) { intervals.push(dt); if (intervals.length > 60) intervals.shift() }

      let predicted: number
      if (playbackMode === 'raw') {
        // baseline: прямо аудио-часы каждый кадр (видно «лесенку» аудио-квантов).
        predicted = audioMs
      } else if (playbackMode === 'framelock') {
        // фикс. шаг refresh×rate за кадр + мягкая подтяжка к аудио (для сравнения).
        predicted = smoothMs + refreshMs() * rate
        const drift = audioMs - predicted
        if (Math.abs(drift) > HARD_RESYNC_MS) predicted = audioMs
        else predicted += drift * (1 - Math.exp(-dt / SYNC_TAU_MS))
        smoothMs = predicted
      } else {
        // smooth/snap: позиция = чисто линейная функция now от якоря (модель теста).
        // Якорь ставим на 1-м кадре и при смене rate; пер-кадровой подтяжки нет.
        if (anchorPerf < 0 || rate !== anchorRate) {
          anchorPerf = now
          anchorMs = audioMs
          anchorRate = rate
        }
        predicted = anchorMs + (now - anchorPerf) * rate
        // Ре-якорь только на разрыве (seek/затык) — иначе вернулась бы рябь.
        if (Math.abs(audioMs - predicted) > HARD_RESYNC_MS) {
          anchorPerf = now
          anchorMs = audioMs
          predicted = audioMs
        }
      }

      // Компенсация задержки звукового тракта (Bluetooth-наушники и т.п.): звук
      // из динамика физически слышен audioOffsetMs позже, чем сообщает аудио-
      // клок, поэтому визуальную позицию сдвигаем на столько же назад — нота
      // достигает линии курсора синхронно с реально услышанным битом, а не с
      // «логической» позицией трека.
      const y = msToScrollY(predicted - audioOffsetMs, offsets, blockLayouts)
      playbackYRef.current = y
      // Ноты всегда сабпиксельно (мягкие спрайты двигаются гладко).
      // Sub-pixel + GPU-композитинг, без reflow и scroll-событий.
      const ty = baseS - y
      content.style.transform = `translate3d(0, ${ty}px, 0)`
      // pixel-snap: сетку (тонкие линии) контр-трансформом подтягиваем на дробный
      // остаток до физического пикселя; ноты остаются сабпиксельными.
      const grid = gridRef.current
      if (grid) {
        if (playbackMode === 'snap') {
          const dpr = window.devicePixelRatio || 1
          const snapped = Math.round(ty * dpr) / dpr
          grid.style.transform = `translate3d(0, ${snapped - ty}px, 0)`
        } else {
          grid.style.transform = ''
        }
      }
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
      if (gridRef.current) gridRef.current.style.transform = ''
      // Передаём позицию нативному скроллу: его onScroll пересинхронит currentTime.
      scroller.scrollTop = y
    }
  }, [isPlaying, playbackMode, playbackFpsCap, audioOffsetMs, blocks, blockLayouts, scrollRef, contentRef, gridRef, playbackYRef])
}
