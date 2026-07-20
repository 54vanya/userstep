import { memo } from 'react'
import type { Block } from '@/types/chart'

// Линии сетки одним фоном на блок (вместо построчных border-div). Три слоя
// repeating-linear-gradient: measure поверх beat поверх sub (на совпадающих
// позициях выигрывает верхний). Опционально вертикальные делители колонок.
// Толщина мягкого края линии и её целевая ширина — см. комментарий в line().
const LINE_RAMP = 0.4
const LINE_WIDTH = 1

export function buildGridBackground(block: Block, rh: number, cw: number, showCols: boolean, showRows: boolean): string {
  // period (rh, rh*split, rh*split*beat) почти всегда дробный CSS px — на
  // каждом повторе паттерна край линии попадает на случайную долю физического
  // пикселя. С жёстким 0→1px стопом браузер то сжимает засветку в 1 физ. px
  // (линия тонкая), то растягивает в 2 (жирная) в зависимости от фазы —
  // вдоль чарта получается банding (соседние линии сильной доли то тонкие,
  // то жирные, воспроизводимо на проде). Мягкий (анти-элиас) переход по ~0.4px
  // с каждой стороны даёт одинаковую суммарную засветку независимо от фазы —
  // толщина стабильна на любом scale/split. Позицию/период НЕ трогаем (иначе
  // сетка со временем разъехалась бы с нотами, которые сидят на точном
  // var(--rh) без округления).
  const line = (period: number, color: string, dir: 'bottom' | 'right') => {
    if (period < LINE_WIDTH + LINE_RAMP * 2 + 0.2) {
      // Слишком плотно для мягкого края (period ~< 2px) — паттерн и так на
      // грани читаемости, банding здесь несуществен.
      const a = Math.max(0, period - 1)
      return `repeating-linear-gradient(to ${dir}, transparent 0, transparent ${a}px, ${color} ${a}px, ${color} ${period}px)`
    }
    const coreStart = period - LINE_WIDTH
    return `repeating-linear-gradient(to ${dir}, `
      + `transparent 0, transparent ${(coreStart - LINE_RAMP).toFixed(3)}px, `
      + `${color} ${(coreStart + LINE_RAMP).toFixed(3)}px, ${color} ${(period - LINE_RAMP).toFixed(3)}px, `
      + `transparent ${period}px)`
  }
  const layers: string[] = []
  // Горизонтальные линии сетки (measure/beat/sub). Опционально скрываются.
  if (showRows) {
    layers.push(
      line(rh * block.split * block.beat, 'var(--color-grid-measure)', 'bottom'),
      line(rh * block.split, 'var(--color-grid-beat)', 'bottom'),
      line(rh, 'var(--color-grid-sub)', 'bottom'),
    )
  }
  if (showCols) layers.push(line(cw, 'var(--color-grid-beat)', 'right'))
  return layers.length ? layers.join(', ') : 'none'
}

interface Props {
  block: Block
  startY: number
  height: number
  rh: number
  cw: number
  notesWidth: number
  showCols: boolean
  showRows: boolean
}

// Фон-сетка одного блока. Вынесен из BlockLayer в отдельный слой, чтобы во время
// playback его можно было пиксель-снэпить независимо от спрайтов нот (тонкие
// линии страдают от сабпиксельного кроулинга, мягкие спрайты — нет).
export const GridBlock = memo(function GridBlock({ block, startY, height, rh, cw, notesWidth, showCols, showRows }: Props) {
  return (
    <div
      className="absolute left-0 pointer-events-none"
      style={{ top: startY, width: notesWidth, height, backgroundImage: buildGridBackground(block, rh, cw, showCols, showRows) }}
    />
  )
})
