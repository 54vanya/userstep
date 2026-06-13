import { memo } from 'react'
import { COLUMN_WIDTH } from '@/utils/geometry'
import type { Block } from '@/types/chart'

// Линии сетки одним фоном на блок (вместо построчных border-div). Три слоя
// repeating-linear-gradient: measure поверх beat поверх sub (на совпадающих
// позициях выигрывает верхний). Опционально вертикальные делители колонок.
export function buildGridBackground(block: Block, rh: number, showCols: boolean, showRows: boolean): string {
  const line = (period: number, color: string, dir: 'bottom' | 'right') => {
    const a = Math.max(0, period - 1)
    return `repeating-linear-gradient(to ${dir}, transparent 0, transparent ${a}px, ${color} ${a}px, ${color} ${period}px)`
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
  if (showCols) layers.push(line(COLUMN_WIDTH, 'var(--color-grid-beat)', 'right'))
  return layers.length ? layers.join(', ') : 'none'
}

interface Props {
  block: Block
  startY: number
  height: number
  rh: number
  notesWidth: number
  showCols: boolean
  showRows: boolean
}

// Фон-сетка одного блока. Вынесен из BlockLayer в отдельный слой, чтобы во время
// playback его можно было пиксель-снэпить независимо от спрайтов нот (тонкие
// линии страдают от сабпиксельного кроулинга, мягкие спрайты — нет).
export const GridBlock = memo(function GridBlock({ block, startY, height, rh, notesWidth, showCols, showRows }: Props) {
  return (
    <div
      className="absolute left-0 pointer-events-none"
      style={{ top: startY, width: notesWidth, height, backgroundImage: buildGridBackground(block, rh, showCols, showRows) }}
    />
  )
})
