import { memo } from 'react'
import type { Block } from '@/types/chart'

// Линии сетки одним фоном на блок (вместо построчных border-div). Три слоя
// repeating-linear-gradient: measure/beat/sub. Опционально вертикальные
// делители колонок.
const LINE_RAMP = 0.4
const LINE_WIDTH = 1

// Мягкий (анти-элиас) край одной линии на позиции pos внутри СВОЕГО
// repeating-gradient. period (rh, rh*split, rh*split*beat) почти всегда
// дробный CSS px — жёсткий 0→1px срез на каждом повторе паттерна попадает на
// случайную долю физического пикселя, и браузер то сжимает засветку в 1
// физ. px, то растягивает в 2 — банding. Плавный переход по ~0.4px с каждой
// стороны даёт одинаковую суммарную засветку независимо от фазы.
function edgeStops(pos: number, color: string, ramp: number, width: number, minStart: number): string {
  const coreStart = pos - width
  const rampStart = Math.max(minStart, coreStart - ramp)
  return `transparent ${rampStart.toFixed(3)}px, ${color} ${(coreStart + ramp).toFixed(3)}px, ${color} ${pos.toFixed(3)}px`
}

function line(period: number, color: string, dir: 'bottom' | 'right'): string {
  const ramp = Math.min(LINE_RAMP, period / 4)
  const width = Math.min(LINE_WIDTH, period / 2)
  return `repeating-linear-gradient(to ${dir}, transparent 0, ${edgeStops(period, color, ramp, width, 0)}, transparent ${period}px)`
}

// Линии МЛАДШЕГО уровня (sub внутри одного beat, beat внутри одного measure):
// count штук на позициях unit, 2*unit, ..., count*unit, БЕЗ линии на самой
// границе repeatWindow (=(count+1)*unit) — её кладёт уровень СТАРШЕ. Без
// этого скипа два независимых мягких края на ОДНОЙ строке складывают альфу
// (transparent-слой поверх transparent-слоя того же цвета не бывает 100%
// прозрачным на границе перехода) — сумма заметно темнее соседних линий
// того же уровня (banding воспроизведён и померен на реальном чарте:
// расширение ramp его не лечит, потому что растёт именно площадь наложения).
// Со скипом на каждой строке красит ровно один уровень — наложения нет в принципе.
function multiLine(repeatWindow: number, unit: number, count: number, color: string, dir: 'bottom' | 'right'): string | null {
  if (count <= 0) return null
  const ramp = Math.min(LINE_RAMP, unit / 4)
  const width = Math.min(LINE_WIDTH, unit / 2)
  const parts: string[] = ['transparent 0']
  let prevEnd = 0
  for (let i = 1; i <= count; i++) {
    const pos = unit * i
    parts.push(edgeStops(pos, color, ramp, width, prevEnd))
    // Закрываем линию сразу же — иначе градиент плавно "течёт" от опаки до
    // rampStart следующей линии через весь промежуток вместо чёткого волоска.
    parts.push(`transparent ${pos.toFixed(3)}px`)
    prevEnd = pos
  }
  parts.push(`transparent ${repeatWindow}px`)
  return `repeating-linear-gradient(to ${dir}, ${parts.join(', ')})`
}

export function buildGridBackground(block: Block, rh: number, cw: number, showCols: boolean, showRows: boolean): string {
  const layers: string[] = []
  // Горизонтальные линии сетки (measure/beat/sub). Опционально скрываются.
  // Позицию/период не трогаем (иначе сетка со временем разъехалась бы с
  // нотами, которые сидят на точном var(--rh) без округления).
  if (showRows) {
    const measurePeriod = rh * block.split * block.beat
    const beatPeriod = rh * block.split
    layers.push(line(measurePeriod, 'var(--color-grid-measure)', 'bottom'))
    const beatLayer = multiLine(measurePeriod, beatPeriod, block.beat - 1, 'var(--color-grid-beat)', 'bottom')
    if (beatLayer) layers.push(beatLayer)
    const subLayer = multiLine(beatPeriod, rh, block.split - 1, 'var(--color-grid-sub)', 'bottom')
    if (subLayer) layers.push(subLayer)
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
