import { memo } from 'react'
import type { Block } from '@/types/chart'

// Линии сетки одним фоном на блок (вместо построчных border-div): один
// составной слой на measure/beat/sub (см. buildRowsLayer — почему именно
// один, а не три). Опционально вертикальные делители колонок.
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

// ВАЖНО (раунд 1): раньше линия была repeating-linear-gradient — бесконечный
// аналитический градиент, который браузер сэмплирует по всей высоте блока
// (на плотных чартах до ~50 000px). Часть тонких линий не прорисовывалась
// вовсе (не банding — полное отсутствие). Заменили на linear-gradient
// размером ровно в один период (background-size) + нативный background-repeat
// — маленький тайл, который просто копируется, вместо бесконечной функции.
//
// ВАЖНО (раунд 2): но measure/beat/sub оставались ТРЕМЯ независимыми слоями
// (каждый — свой tile ↔ свой период), которые должны были совпадать пиксель
// в пиксель на строках, кратных нескольким уровням (beat совпадает с sub,
// measure — с beat), а старший визуально перекрывал младший (occlusion по
// порядку слоёв). На реальном деплое (не на localhost/Playwright) поймали
// двоение: два независимых слоя с НЕСоизмеримыми дробными периодами каждый
// свой тайл растеризует и округляет к своей сетке физ. пикселей отдельно —
// на некоторых строках их «совпадающие» позиции расходятся на 1-2px, и вместо
// одной перекрытой линии видно две соседних. Фикс: единственный СОСТАВНОЙ
// тайл на измерение (см. buildRowsLayer) — один цвет на строку без дублей
// (skip-логика, как раньше в multiLine, но тайл теперь bounded через
// background-size, а не бесконечный repeating-gradient) — совпадений между
// слоями больше нет по построению, потому что слой всего один.
function lineLayer(period: number, color: string, dir: 'right'): LineLayer {
  const ramp = Math.min(LINE_RAMP, period / 4)
  const width = Math.min(LINE_WIDTH, period / 2)
  const stops = edgeStops(period, color, ramp, width, 0)
  return {
    image: `linear-gradient(to ${dir}, transparent 0, ${stops}, transparent ${period}px)`,
    size: `${period}px 100%`,
    repeat: 'repeat-x',
  }
}

// Один тайл высотой в measure-период, со стопами на КАЖДУЮ строку measure
// ровно один раз (measure/beat/sub по приоритету, без повторов) — тот же
// принцип, что у старого multiLine, но тайл теперь конечного размера
// (background-size), а не бесконечный repeating-gradient.
function buildRowsLayer(rh: number, split: number, beat: number): LineLayer {
  const rowsPerMeasure = split * beat
  const measurePeriod = rh * rowsPerMeasure
  const ramp = Math.min(LINE_RAMP, rh / 4)
  const width = Math.min(LINE_WIDTH, rh / 2)
  const parts: string[] = ['transparent 0']
  let prevEnd = 0
  for (let i = 1; i <= rowsPerMeasure; i++) {
    const pos = rh * i
    const color = i === rowsPerMeasure
      ? 'var(--color-grid-measure)'
      : i % split === 0
        ? 'var(--color-grid-beat)'
        : 'var(--color-grid-sub)'
    parts.push(edgeStops(pos, color, ramp, width, prevEnd))
    // Закрываем линию сразу же — иначе градиент плавно "течёт" от опаки до
    // rampStart следующей линии через весь промежуток вместо чёткого волоска.
    parts.push(`transparent ${pos.toFixed(3)}px`)
    prevEnd = pos
  }
  return {
    image: `linear-gradient(to bottom, ${parts.join(', ')})`,
    size: `100% ${measurePeriod.toFixed(3)}px`,
    repeat: 'repeat-y',
  }
}

export interface GridBackground {
  backgroundImage: string
  backgroundSize: string
  backgroundRepeat: string
}

export function buildGridBackground(block: Block, rh: number, cw: number, showCols: boolean, showRows: boolean): GridBackground {
  const layers: LineLayer[] = []
  // Позицию/период не трогаем (иначе сетка со временем разъехалась бы с
  // нотами, которые сидят на точном var(--rh) без округления).
  if (showRows) layers.push(buildRowsLayer(rh, block.split, block.beat))
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
