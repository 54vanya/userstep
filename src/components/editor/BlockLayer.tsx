import { memo } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { rhythmColor, RHYTHM_YELLOW, RHYTHM_HOLD_BLUE } from '@/utils/rhythmColors'
import { noteEnd } from '@/utils/holds'
import type { Block, Note } from '@/types/chart'

const DIRECTIONS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']

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
function ArrowSprite({ src, x, top, cw, opacity, color, z, lumFilter }: { src: string; x: number; top: number; cw: number; opacity?: number; color?: string; z?: number; lumFilter?: string }) {
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
function ImageSprite({ note, rh, cw, totalRows, skin, ghost, color }: { note: Note; rh: number; cw: number; totalRows: number; skin: string; ghost?: boolean; color?: string }) {
  const x = note.col * cw
  const dir = DIRECTIONS[note.col % 5]
  const opacity = ghost ? 0.5 : undefined
  const lumFilter = arrowFilter(color)
  // При ритм-окраске tap/голова/тело/кэп рисуются на нормализованных серых спрайтах.
  const tapSrc = rhythmBase(skin, dir, color)

  if (note.type === 'tap') {
    return (
      <ArrowSprite src={tapSrc} x={x} top={note.row * rh} cw={cw} opacity={opacity} color={color} z={1 + note.row} lumFilter={lumFilter} />
    )
  }

  const endRow = noteEnd(note)
  // Тело начинается от НИЖНЕЙ грани клетки головы (row*rh + cw/2): в самой клетке
  // рисуется заглушка Hold-HeadStub — фрагмент тела, обрезанный по нижнему контуру
  // стрелки, чтобы рельсы «выходили из хвостика», а не торчали сбоку/выше него.
  // У continued-частей цепочки головы нет — тело идёт от верха блока.
  const bodyTop = note.continued ? note.row * rh : note.row * rh + cw / 2
  // КОРОТКИЙ холд (длина < cw, клетки головы и кэпа перекрываются): лесенка z
  // кладёт кэп ПОВЕРХ головы, а в арт обычного кэпа впечатаны белые полосы
  // рельс — они ложились бы на стрелку головы «телом поверх стрелки». Поэтому
  // кэпом служит чистая стрелка-тап (в ритм-режиме она перекрашена синим и
  // отличима от голов); рельсы под ней дают заглушка и тело.
  const shortCap = !note.continues && !note.continued && (endRow - note.row) * rh < cw
  // Хвостовой кэп центрирован на линии хвоста (endRow*rh), как нота на хит-линии.
  // Тело тянется до ВЕРХНЕЙ грани обычного кэпа (endRow*rh - cw/2) — иначе оно
  // просвечивало бы сквозь полупрозрачный верх; у короткого кэпа рельс нет —
  // тело идёт до самой линии хвоста, закрывая просвет между заглушкой и стрелкой.
  const bodyBot = note.continues ? totalRows * rh : endRow * rh - (shortCap ? 0 : cw / 2)
  // При ритм-окраске (color задан) тело, заглушка и кэп рисуются на нормализованных
  // серых подложках и перекрашиваются единым синим тем же приёмом, что и голова: слой
  // цвета с mix-blend-mode:color по маске спрайта — тон одинаков на всех колонках.
  const bodySrc = rhythmBase(skin, dir, color, 'Hold-Body')
  const capSrc = rhythmBase(skin, dir, color, shortCap ? 'Tap-Note' : 'Hold-BottomCap')
  const stubSrc = rhythmBase(skin, dir, color, 'Hold-HeadStub')
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
          style={{ left: x, top: note.row * rh, width: cw, height: cw, transform: 'translateY(-50%)', opacity, isolation: 'isolate' }}
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
          left: x, top: bodyTop, width: cw, height: Math.max(0, bodyBot - bodyTop),
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
        <div
          className="absolute pointer-events-none"
          style={{
            left: x, top: endRow * rh, width: cw, height: cw, transform: 'translateY(-50%)', opacity, isolation: 'isolate',
            zIndex: 1 + endRow,
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
      )}
      {!note.continued && (
        <ArrowSprite src={tapSrc} x={x} top={note.row * rh} cw={cw} opacity={opacity} color={color} z={1 + note.row} lumFilter={lumFilter} />
      )}
    </>
  )
}

function BlocksSprite({ note, rh, cw, totalRows, ghost, color }: { note: Note; rh: number; cw: number; totalRows: number; ghost?: boolean; color?: string }) {
  const x = note.col * cw
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <div
        className="absolute rounded-sm border shadow-sm pointer-events-none"
        style={{ left: x + 1, top: note.row * rh, width: cw - 2, height: rh, transform: 'translateY(-50%)', opacity, backgroundColor: color ?? '#60a5fa', borderColor: color ?? '#93c5fd' }}
      />
    )
  }

  const endRow = noteEnd(note)
  // Холд как объединение ячеек, центрированных на линиях: от верхней грани стартовой
  // ячейки (row*rh - rh/2) до нижней грани конечной (endRow*rh + rh/2). Кросс-блочные
  // края (continued/continues) — впритык к границе блока, чтобы шов был бесшовным.
  const top = note.continued ? 0 : note.row * rh - rh / 2
  const bot = note.continues ? totalRows * rh : endRow * rh + rh / 2
  const roundTop = !note.continued
  const roundBot = !note.continues
  return (
    <div
      className="absolute bg-green-600 border-x border-green-400 pointer-events-none"
      style={{
        left: x + 1, top, width: cw - 2, height: Math.max(0, bot - top), opacity,
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
  startY: number
  rh: number
  cw: number
  totalRows: number
  height: number
  notesWidth: number
  previewNotes: Note[] | null
}

// Один блок: только ноты (сетка вынесена в отдельный GridBlock-слой). Мемоизирован
// и не зависит от прокрутки — во время playback не ре-рендерится вовсе (двигается
// только transform родителя).
export const BlockLayer = memo(function BlockLayer({ block, startY, rh, cw, totalRows, height, notesWidth, previewNotes }: Props) {
  const skin = useEditorStore(s => s.activeSkin)
  const rhythmColoring = useEditorStore(s => s.rhythmColoring)
  const isBlocks = skin === 'blocks'
  // split одинаков для всего блока, поэтому ритм-цвет зависит только от row ноты.
  const colorOf = (note: Note) => (rhythmColoring ? rhythmColor(note.row, block.split) : undefined)

  return (
    // zIndex:0 создаёт stacking context: «лесенка» z спрайтов по строкам (стрелка
    // нижней строки поверх верхней, как перекрывающиеся ноты в игре) не выходит
    // за пределы блока и не конкурирует с курсором/оверлеями; сами блоки при
    // равном z=0 укладываются в DOM-порядке — низ следующего блока поверх.
    <div className="absolute left-0" style={{ top: startY, width: notesWidth, height, zIndex: 0 }}>
      {block.notes.map((note, i) =>
        isBlocks
          ? <BlocksSprite key={i} note={note} rh={rh} cw={cw} totalRows={totalRows} color={colorOf(note)} />
          : <ImageSprite key={i} note={note} rh={rh} cw={cw} totalRows={totalRows} skin={skin} color={colorOf(note)} />
      )}
      {previewNotes?.map((note, i) => (isBlocks
        ? <BlocksSprite key={`p${i}`} note={note} rh={rh} cw={cw} totalRows={totalRows} ghost color={colorOf(note)} />
        : <ImageSprite key={`p${i}`} note={note} rh={rh} cw={cw} totalRows={totalRows} skin={skin} ghost color={colorOf(note)} />))}
    </div>
  )
})
