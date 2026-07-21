import { memo } from 'react'
import type { Block } from '@/types/chart'

// Линии сетки одним фоном на блок (вместо построчных border-div). Три слоя
// на measure/beat/sub. Опционально вертикальные делители колонок.
const LINE_RAMP = 0.4
const LINE_WIDTH = 1

// Мягкий (анти-элиас) край одной линии на позиции pos внутри своего тайла.
// period (rh, rh*split, rh*split*beat) почти всегда дробный CSS px — жёсткий
// 0→1px срез на каждом повторе паттерна попадает на случайную долю
// физического пикселя, и браузер то сжимает засветку в 1 физ. px, то
// растягивает в 2 — банding. Плавный переход по ~0.4px с каждой стороны даёт
// одинаковую суммарную засветку независимо от фазы.
function edgeStops(pos: number, color: string, ramp: number, width: number, minStart: number): string {
  const coreStart = pos - width
  const rampStart = Math.max(minStart, coreStart - ramp)
  return `transparent ${rampStart.toFixed(3)}px, ${color} ${(coreStart + ramp).toFixed(3)}px, ${color} ${pos.toFixed(3)}px`
}

interface LineLayer {
  image: string
  size: string
  repeat: string
}

// ВАЖНО: раньше линия была repeating-linear-gradient — бесконечный
// аналитический градиент, который браузер сэмплирует по всей высоте блока
// (на плотных чартах до ~50 000px). Дважды воспроизводили баг именно на этом
// (см. историю): часть тонких линий не прорисовывалась вовсе (не банding —
// полное отсутствие), причём на прод-сборке хуже, чем в Chromium/Playwright,
// где чинилось — судя по всему, разные движки (Skia/CoreGraphics) по-разному
// (и не всегда надёжно) сэмплируют многокилометровый repeating-gradient с
// волосковыми деталями. Вместо аналитической бесконечной картинки — обычный
// линейный градиент РАЗМЕРОМ РОВНО В ОДИН ПЕРИОД (background-size) и нативный
// background-repeat: браузер рендерит один маленький тайл (макс. — высота
// measure-периода, единицы сотен px) и просто копирует его — это стандартный,
// давно обкатанный путь (полосатые/шахматные фоны), а не бесконечная
// градиентная функция с волоском на весь блок.
function lineLayer(period: number, color: string, dir: 'bottom' | 'right'): LineLayer {
  const ramp = Math.min(LINE_RAMP, period / 4)
  const width = Math.min(LINE_WIDTH, period / 2)
  const stops = edgeStops(period, color, ramp, width, 0)
  if (dir === 'bottom') {
    return {
      image: `linear-gradient(to bottom, transparent 0, ${stops}, transparent ${period}px)`,
      size: `100% ${period}px`,
      repeat: 'repeat-y',
    }
  }
  return {
    image: `linear-gradient(to right, transparent 0, ${stops}, transparent ${period}px)`,
    size: `${period}px 100%`,
    repeat: 'repeat-x',
  }
}

export interface GridBackground {
  backgroundImage: string
  backgroundSize: string
  backgroundRepeat: string
}

// double-alpha на совпадающих строках (measure совпадает с beat, beat — с
// sub) убирает не skip-логика по стопам, а порядок слоёв: measure/beat лежат
// ПЕРВЫМИ в списке (CSS: первый слой рисуется поверх), их непрозрачная
// сердцевина перекрывает младший уровень на той же строке вместо сложения
// альфы с ним.
export function buildGridBackground(block: Block, rh: number, cw: number, showCols: boolean, showRows: boolean): GridBackground {
  const layers: LineLayer[] = []
  // Горизонтальные линии сетки (measure/beat/sub). Опционально скрываются.
  // Позицию/период не трогаем (иначе сетка со временем разъехалась бы с
  // нотами, которые сидят на точном var(--rh) без округления).
  if (showRows) {
    const measurePeriod = rh * block.split * block.beat
    const beatPeriod = rh * block.split
    layers.push(lineLayer(measurePeriod, 'var(--color-grid-measure)', 'bottom'))
    layers.push(lineLayer(beatPeriod, 'var(--color-grid-beat)', 'bottom'))
    layers.push(lineLayer(rh, 'var(--color-grid-sub)', 'bottom'))
  }
  if (showCols) layers.push(lineLayer(cw, 'var(--color-grid-beat)', 'right'))
  if (!layers.length) return { backgroundImage: 'none', backgroundSize: 'auto', backgroundRepeat: 'repeat' }
  return {
    backgroundImage: layers.map(l => l.image).join(', '),
    backgroundSize: layers.map(l => l.size).join(', '),
    backgroundRepeat: layers.map(l => l.repeat).join(', '),
  }
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
  const bg = buildGridBackground(block, rh, cw, showCols, showRows)
  return (
    <div
      className="absolute left-0 pointer-events-none"
      style={{ top: startY, width: notesWidth, height, ...bg }}
    />
  )
})
