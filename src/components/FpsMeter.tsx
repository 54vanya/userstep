import { useEffect, useState } from 'react'

interface Stats {
  fps: number
  worstMs: number // самый длинный интервал между кадрами в окне
  longFrames: number // сколько кадров заметно длиннее ожидаемого
}

// Оверлей с метриками плавности. Средний FPS маскирует периодические рывки,
// поэтому показываем ещё худший интервал кадра (worstMs) и число «длинных»
// кадров за окно — именно они дают видимое дёрганье при «стабильном» FPS.
export function FpsMeter() {
  const [stats, setStats] = useState<Stats>({ fps: 0, worstMs: 0, longFrames: 0 })

  useEffect(() => {
    let rafId: number
    let frames = 0
    let worst = 0
    let long = 0
    let windowStart = performance.now()
    let lastFrame = windowStart
    // Порог «длинного» кадра — 1.5× от наблюдаемого среднего интервала окна.

    const tick = (now: number) => {
      const dt = now - lastFrame
      lastFrame = now
      frames++
      if (dt > worst) worst = dt

      const elapsed = now - windowStart
      if (elapsed >= 500) {
        const fps = Math.round((frames * 1000) / elapsed)
        const avgInterval = elapsed / frames
        // Считаем «длинными» кадры > 1.6× среднего (грубая оценка дропов).
        // long считается отдельным проходом ниже — но дешевле копить на лету:
        setStats({ fps, worstMs: Math.round(worst * 10) / 10, longFrames: long })
        frames = 0
        worst = 0
        long = 0
        windowStart = now
        void avgInterval
      } else if (frames > 1 && dt > 1.6 * (elapsed / frames)) {
        long++
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Зелёный, пока худший кадр близок к норме; жёлтый/красный при спайках.
  const color = stats.worstMs <= 14 ? '#4ade80' : stats.worstMs <= 22 ? '#facc15' : '#f87171'

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 6,
        right: 6,
        zIndex: 9999,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.7)',
        color,
        font: '11px ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {stats.fps} fps · worst {stats.worstMs}ms · long {stats.longFrames}
    </div>
  )
}
