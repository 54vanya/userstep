import { memo, useMemo } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { rhythmColor, RHYTHM_YELLOW, RHYTHM_HOLD_BLUE } from '@/utils/rhythmColors'
import { noteEnd } from '@/utils/holds'
import { SPRITE_DIRECTIONS as DIRECTIONS } from '@/utils/spritePreload'
import type { Block, Note } from '@/types/chart'

// Подложка для ритм-окраски (скин 'basic') — заранее сгенерированные СЕРЫЕ спрайты с
// нормализованной яркостью «тела» (public/skin/basic/rhythm/: тапы, тела и кэпы
// холдов; базовый цвет направления → серый 120, белый/чёрный сохранены):
// все направления и центр приведены к единому тону, белые контуры сохранены. Благодаря
// этому mix-blend-mode:color (берёт яркость подложки) даёт одинаковый цвет на всех
// колонках — больше нет «центр светлее стрелок» и скачков тона на телах холдов.
function rhythmBase(skin: string, dir: string, color?: string, part = 'Tap-Note'): string {
  const prefix = color && skin === 'basic' ? `/skin/${skin}/rhythm` : `/skin/${skin}`
  return `${prefix}/${dir}-${part}.png`
}

// Яркостная коррекция перед color-блендингом. Подложка серая и нормализованная, так
// что фильтр действует одинаково на всех колонках. Жёлтый (16-е) на средней яркости
// читается тёмно-оливковым — поднимаем подложку, чтобы он выходил светлым/чистым.
function arrowFilter(color?: string): string | undefined {
  return color === RHYTHM_YELLOW ? 'brightness(1.7)' : undefined
}

// Спрайт стрелки (tap / голова холда). При ритм-окраске поверх картинки кладётся
// слой ритм-цвета с mix-blend-mode:color и маской по самой стрелке — он меняет
// тон, сохраняя контур и светотень (стрелка «перекрашивается», а не заливается
// плашкой). isolation:isolate ограничивает блендинг только этой картинкой.
// top — CSS-выражение от var(--rh) (см. комментарий у BlockLayer).
function ArrowSprite({ src, x, top, cw, opacity, color, z, lumFilter }: { src: string; x: number; top: string; cw: number; opacity?: number; color?: string; z?: number; lumFilter?: string }) {
  if (!color) {
    return (
      <img
        src={src}
        draggable={false}
        className="absolute pointer-events-none"
        style={{ left: x, top, width: cw, height: cw, transform: 'translateY(-50%)', opacity, zIndex: z }}
      />
    )
  }
  // lumFilter — необязательная яркостная коррекция подложки (для жёлтого).
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top, width: cw, height: cw, transform: 'translateY(-50%)', opacity, zIndex: z, isolation: 'isolate' }}
    >
      <img src={src} draggable={false} className="block w-full h-full" style={lumFilter ? { filter: lumFilter } : undefined} />
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: color,
          mixBlendMode: 'color',
          WebkitMaskImage: `url(${src})`,
          maskImage: `url(${src})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
    </div>
  )
}

// Одна нота как спрайт (вместо построчных ячеек). Для холда — единый body на весь
// пролёт + шапка/кэп по флагам continued/continues (включая кросс-блочные холды).
// cw — эффективная ширина колонки (= размер ноты) с учётом зума поля.
// color — ритм-цвет (задан, когда включена ритм-окраска); красит tap и голову холда.
// Все вертикальные координаты — CSS-выражения от var(--rh): при смене scale
// браузер пересчитывает calc'и сам, без пере-рендера спрайтов в React.
function ImageSprite({ note, cw, totalRows, skin, ghost, color }: { note: Note; cw: number; totalRows: number; skin: string; ghost?: boolean; color?: string }) {
  const x = note.col * cw
  const dir = DIRECTIONS[note.col % 5]
  const opacity = ghost ? 0.5 : undefined
  const lumFilter = arrowFilter(color)
  // При ритм-окраске tap/голова/тело/кэп рисуются на нормализованных серых спрайтах.
  const tapSrc = rhythmBase(skin, dir, color)
  const headTop = `calc(${note.row} * var(--rh))`

  if (note.type === 'tap') {
    return (
      <ArrowSprite src={tapSrc} x={x} top={headTop} cw={cw} opacity={opacity} color={color} z={1 + note.row} lumFilter={lumFilter} />
    )
  }

  const endRow = noteEnd(note)
  // Тело начинается от НИЖНЕЙ грани клетки головы (row*rh + cw/2): в самой клетке
  // рисуется заглушка Hold-HeadStub — фрагмент тела, обрезанный по нижнему контуру
  // стрелки, чтобы рельсы «выходили из хвостика», а не торчали сбоку/выше него.
  // У continued-частей цепочки головы нет — тело идёт от верха блока.
  const bodyTop = note.continued ? `${note.row} * var(--rh)` : `${note.row} * var(--rh) + ${cw / 2}px`
  // Хвостовой кэп центрирован на линии хвоста (endRow*rh), как нота на хит-линии.
  // Тело тянется до ВЕРХНЕЙ грани кэпа (endRow*rh - cw/2) — иначе оно
  // просвечивало бы сквозь полупрозрачный верх; дальше рельсы дорисовывает арт кэпа.
  const bodyBot = note.continues ? `${totalRows} * var(--rh)` : `${endRow} * var(--rh) - ${cw / 2}px`
  // При ритм-окраске (color задан) тело, заглушка и кэп рисуются на нормализованных
  // серых подложках и перекрашиваются единым синим тем же приёмом, что и голова: слой
  // цвета с mix-blend-mode:color по маске спрайта — тон одинаков на всех колонках.
  const bodySrc = rhythmBase(skin, dir, color, 'Hold-Body')
  const capSrc = rhythmBase(skin, dir, color, 'Hold-BottomCap')
  const stubSrc = rhythmBase(skin, dir, color, 'Hold-HeadStub')
  // У короткого холда клетка кэпа залезает в клетку головы, и впечатанные в арт
  // кэпа рельсы торчали бы сбоку/выше стрелки. Выше bodyTop рельсы рисует только
  // заглушка (обрезана по контуру стрелки) — верх кэпа срезаем до этой линии.
  // Срез задевает и верх самой стрелки кэпа, поэтому поверх кладётся её целый
  // арт без рельс (Hold-BottomCapArrow, рельсы срезаны по силуэту) — рельсы
  // остаются ПОЗАДИ стрелки кэпа, а голова по-прежнему перекрывает всё.
  // «Короткость» холда зависит от rh, а rh живёт в CSS — поэтому слой стрелки
  // кэпа рендерится всегда, а срезы считает браузер: у длинного холда
  // capClip = 0px и обратный inset (cw − 0) клипует слой в ноль.
  const capClip = `max(0px, calc((${bodyTop}) - (${endRow} * var(--rh) - ${cw / 2}px)))`
  const capArrowSrc = rhythmBase(skin, dir, color, 'Hold-BottomCapArrow')
  const bodyStyle: React.CSSProperties = {
    backgroundImage: `url(${bodySrc})`,
    backgroundSize: `${cw}px auto`,
    backgroundRepeat: 'repeat-y',
  }
  return (
    <>
      {!note.continued && (
        <div
          className="absolute pointer-events-none"
          style={{ left: x, top: headTop, width: cw, height: cw, transform: 'translateY(-50%)', opacity, isolation: 'isolate' }}
        >
          <img src={stubSrc} draggable={false} className="block w-full h-full" />
          {color && (
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: RHYTHM_HOLD_BLUE,
                mixBlendMode: 'color',
                WebkitMaskImage: `url(${stubSrc})`,
                maskImage: `url(${stubSrc})`,
                WebkitMaskSize: '100% 100%',
                maskSize: '100% 100%',
                WebkitMaskRepeat: 'no-repeat',
                maskRepeat: 'no-repeat',
              }}
            />
          )}
        </div>
      )}
      <div
        className="absolute pointer-events-none"
        style={{
          left: x, top: `calc(${bodyTop})`, width: cw, height: `max(0px, calc((${bodyBot}) - (${bodyTop})))`,
          opacity, isolation: 'isolate',
          ...(color ? {} : bodyStyle),
        }}
      >
        {color && (
          <>
            <div className="absolute inset-0" style={bodyStyle} />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: RHYTHM_HOLD_BLUE,
                mixBlendMode: 'color',
                WebkitMaskImage: `url(${bodySrc})`,
                maskImage: `url(${bodySrc})`,
                WebkitMaskSize: `${cw}px auto`,
                maskSize: `${cw}px auto`,
                WebkitMaskRepeat: 'repeat-y',
                maskRepeat: 'repeat-y',
              }}
            />
          </>
        )}
      </div>
      {!note.continues && (
        <>
          <div
            className="absolute pointer-events-none"
            // Кэп идёт ПОД головой своего холда (z = 1 + row головы, DOM-порядок: кэп
            // раньше головы): при коротком холде, когда клетки перекрываются, впечатанные
            // в арт кэпа рельсы уходят под стрелку головы, а не ложатся поверх неё.
            style={{
              left: x, top: `calc(${endRow} * var(--rh))`, width: cw, height: cw, transform: 'translateY(-50%)', opacity, isolation: 'isolate',
              zIndex: 1 + note.row,
              clipPath: `inset(${capClip} 0 0 0)`,
            }}
          >
            <img src={capSrc} draggable={false} className="block w-full h-full" />
            {color && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: RHYTHM_HOLD_BLUE,
                  mixBlendMode: 'color',
                  WebkitMaskImage: `url(${capSrc})`,
                  maskImage: `url(${capSrc})`,
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                }}
              />
            )}
          </div>
          <div
            className="absolute pointer-events-none"
            // Стрелка кэпа без рельс ТОЛЬКО в срезанной зоне (обратный inset):
            // срез убрал её верх вместе с рельсами, а рельсы должны оставаться
            // позади стрелки. Ниже линии среза арт рисует основной слой кэпа —
            // без обратного среза полупрозрачные участки арта рисовались бы
            // дважды и плотнели, а граница читалась бы контуром.
            style={{
              left: x, top: `calc(${endRow} * var(--rh))`, width: cw, height: cw, transform: 'translateY(-50%)', opacity, isolation: 'isolate',
              zIndex: 1 + note.row,
              clipPath: `inset(0 0 calc(${cw}px - ${capClip}) 0)`,
            }}
          >
            <img src={capArrowSrc} draggable={false} className="block w-full h-full" />
            {color && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: RHYTHM_HOLD_BLUE,
                  mixBlendMode: 'color',
                  WebkitMaskImage: `url(${capArrowSrc})`,
                  maskImage: `url(${capArrowSrc})`,
                  WebkitMaskSize: '100% 100%',
                  maskSize: '100% 100%',
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                }}
              />
            )}
          </div>
        </>
      )}
      {!note.continued && (
        <ArrowSprite src={tapSrc} x={x} top={headTop} cw={cw} opacity={opacity} color={color} z={1 + note.row} lumFilter={lumFilter} />
      )}
    </>
  )
}

function BlocksSprite({ note, cw, totalRows, ghost, color }: { note: Note; cw: number; totalRows: number; ghost?: boolean; color?: string }) {
  const x = note.col * cw
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <div
        className="absolute rounded-sm border shadow-sm pointer-events-none"
        style={{ left: x + 1, top: `calc(${note.row} * var(--rh))`, width: cw - 2, height: 'var(--rh)', transform: 'translateY(-50%)', opacity, backgroundColor: color ?? '#60a5fa', borderColor: color ?? '#93c5fd' }}
      />
    )
  }

  const endRow = noteEnd(note)
  // Холд как объединение ячеек, центрированных на линиях: от верхней грани стартовой
  // ячейки (row*rh - rh/2) до нижней грани конечной (endRow*rh + rh/2). Кросс-блочные
  // края (continued/continues) — впритык к границе блока, чтобы шов был бесшовным.
  const top = note.continued ? '0px' : `(${note.row} - 0.5) * var(--rh)`
  const bot = note.continues ? `${totalRows} * var(--rh)` : `(${endRow} + 0.5) * var(--rh)`
  const roundTop = !note.continued
  const roundBot = !note.continues
  return (
    <div
      className="absolute bg-green-600 border-x border-green-400 pointer-events-none"
      style={{
        left: x + 1, top: `calc(${top})`, width: cw - 2, height: `max(0px, calc((${bot}) - (${top})))`, opacity,
        // При ритм-окраске тело холда — единый синий (голова у этого скина не отдельная).
        ...(color ? { backgroundColor: RHYTHM_HOLD_BLUE, borderColor: '#7fa3f7' } : {}),
        borderTopWidth: roundTop ? 1 : 0,
        borderBottomWidth: roundBot ? 1 : 0,
        borderTopLeftRadius: roundTop ? 2 : 0,
        borderTopRightRadius: roundTop ? 2 : 0,
        borderBottomLeftRadius: roundBot ? 2 : 0,
        borderBottomRightRadius: roundBot ? 2 : 0,
      }}
    />
  )
}

interface Props {
  block: Block
  cw: number
  totalRows: number
  previewNotes: Note[] | null
}

// Сегмент нот внутри блока — гранула content-visibility. Блочной гранулярности
// (BlockSlot) мало: у не-гиммик чартов блоки огромные (а бывает и один на весь
// чарт), и пока блок пересекает вьюпорт, браузер пересчитывал бы calc(var(--rh))
// ВСЕХ его спрайтов на каждый тик scale. Чанк ~64 нот ограничивает пересчёт
// и первичный рендер «на въезде» в вьюпорт парой сотен элементов.
const SEGMENT_NOTES = 64

interface Segment {
  notes: Note[]
  minRow: number
  // Нижняя граница экстента с учётом хвостов холдов (кросс-блочный — до конца блока).
  maxRow: number
}

function buildSegments(notes: Note[], totalRows: number): Segment[] {
  // Сортировка по row: сегменты получают компактные непересекающиеся (по головам)
  // диапазоны строк. Z-порядок не страдает: внутри сегмента работает та же
  // «лесенка» zIndex=1+row, а между сегментами — DOM-порядок (сегмент нижних
  // строк позже и рисуется поверх — ровно как глобальная лесенка).
  const sorted = [...notes].sort((a, b) => a.row - b.row)
  const segments: Segment[] = []
  for (let i = 0; i < sorted.length; i += SEGMENT_NOTES) {
    const chunk = sorted.slice(i, i + SEGMENT_NOTES)
    let minRow = Infinity
    let maxRow = -Infinity
    for (const n of chunk) {
      minRow = Math.min(minRow, n.row)
      maxRow = Math.max(maxRow, n.type === 'hold' ? (n.continues ? totalRows : noteEnd(n)) : n.row)
    }
    segments.push({ notes: chunk, minRow, maxRow })
  }
  return segments
}

// Обёртка сегмента: границы — по экстенту его нот плюс выступ спрайта за крайнюю
// строку (спрайт basic высотой cw, плашка blocks высотой rh — берём max() в CSS,
// rh на этом уровне только как var). Внутренний слой (height:0, overflow visible)
// возвращает координаты блока — спрайты о сегментации не знают.
function SegmentSlot({ minRow, maxRow, cw, children }: { minRow: number; maxRow: number; cw: number; children: React.ReactNode }) {
  const pad = `max(${cw / 2}px, var(--rh) / 2)`
  return (
    <div
      className="absolute left-0 w-full"
      style={{
        top: `calc(${minRow} * var(--rh) - ${pad})`,
        height: `calc(${maxRow - minRow} * var(--rh) + 2 * ${pad})`,
        contentVisibility: 'auto',
      } as React.CSSProperties}
    >
      <div className="absolute left-0 w-full" style={{ top: `calc(${pad} - ${minRow} * var(--rh))`, height: 0 }}>
        {children}
      </div>
    </div>
  )
}

// Один блок: только ноты (сетка вынесена в отдельный GridBlock-слой). Мемоизирован
// и не зависит ни от прокрутки, ни от scale: во время playback не ре-рендерится
// вовсе (двигается transform родителя), а при смене scale обновляется лишь
// var(--rh) на обёртке блока в ChartGrid — все вертикальные координаты спрайтов
// заданы calc'ами от неё, пересчёт делает браузер (дёшево: layout/paint — единицы
// мс), а не React (пере-рендер тысяч спрайтов давал фризы до ~100мс на тик).
export const BlockLayer = memo(function BlockLayer({ block, cw, totalRows, previewNotes }: Props) {
  const skin = useEditorStore(s => s.activeSkin)
  const rhythmColoring = useEditorStore(s => s.rhythmColoring)
  const isBlocks = skin === 'blocks'
  // split одинаков для всего блока, поэтому ритм-цвет зависит только от row ноты.
  const colorOf = (note: Note) => (rhythmColoring ? rhythmColor(note.row, block.split) : undefined)
  const segments = useMemo(() => buildSegments(block.notes, totalRows), [block.notes, totalRows])

  return (
    <>
      {segments.map((seg, si) => (
        <SegmentSlot key={si} minRow={seg.minRow} maxRow={seg.maxRow} cw={cw}>
          {seg.notes.map((note, i) =>
            isBlocks
              ? <BlocksSprite key={i} note={note} cw={cw} totalRows={totalRows} color={colorOf(note)} />
              : <ImageSprite key={i} note={note} cw={cw} totalRows={totalRows} skin={skin} color={colorOf(note)} />
          )}
        </SegmentSlot>
      ))}
      {/* Превью (растягиваемый холд / серия тапов) — вне сегментов: их мало,
          зато они не «дёргают» сегментные контейнеры на каждый шаг жеста. */}
      {previewNotes?.map((note, i) => (isBlocks
        ? <BlocksSprite key={`p${i}`} note={note} cw={cw} totalRows={totalRows} ghost color={colorOf(note)} />
        : <ImageSprite key={`p${i}`} note={note} cw={cw} totalRows={totalRows} skin={skin} ghost color={colorOf(note)} />))}
    </>
  )
})
