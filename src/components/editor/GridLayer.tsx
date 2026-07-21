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

// Раньше beat/sub рисовались через multiLine — один gradient-слой со списком
// стопов на весь measure/beat-период, пропускающий позицию, которую кладёт
// уровень старше (чтобы не суммировать альфу мягких краёв на одной строке,
// см. историю). На плотных чартах (большой scale, Split=4) это давало ДРУГОЙ
// баг: у beat-слоя период = rh*beat (напр. 682px) при ширине волоска ~1px —
// на проде часть линий (обычно 1-2 из десятков) не прорисовывалась вовсе,
// видимо браузер сэмплирует длинный многостоповый repeating-gradient через
// текстуру ограниченного разрешения, и тонкий стоп между её сэмплами
// теряется (воспроизведено и померено: часть строк без линии вообще, не
// только банding). Вернулись к простым однострочным repeating-gradient на
// СВОЁМ коротком периоде (rh / rh*split / rh*split*beat) для каждого уровня;
// double-alpha на совпадающих строках убирает не skip-логика, а порядок
// слоёв — measure/beat лежат ПЕРВЫМИ в списке (CSS: первый слой рисуется
// поверх), их непрозрачная сердцевина перекрывает младший уровень на той же
// строке вместо сложения альфы с ним.
function line(period: number, color: string, dir: 'bottom' | 'right'): string {
  const ramp = Math.min(LINE_RAMP, period / 4)
  const width = Math.min(LINE_WIDTH, period / 2)
  return `repeating-linear-gradient(to ${dir}, transparent 0, ${edgeStops(period, color, ramp, width, 0)}, transparent ${period}px)`
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
    layers.push(line(beatPeriod, 'var(--color-grid-beat)', 'bottom'))
    layers.push(line(rh, 'var(--color-grid-sub)', 'bottom'))
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
