import { memo } from 'react'
import { useEditorStore } from '@/store/editorStore'
import type { Block, Note } from '@/types/chart'

const DIRECTIONS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']

// Одна нота как спрайт (вместо построчных ячеек). Для холда — единый body на весь
// пролёт + шапка/кэп по флагам continued/continues (включая кросс-блочные холды).
// cw — эффективная ширина колонки (= размер ноты) с учётом зума поля.
function ImageSprite({ note, rh, cw, totalRows, skin, ghost }: { note: Note; rh: number; cw: number; totalRows: number; skin: string; ghost?: boolean }) {
  const x = note.col * cw
  const dir = DIRECTIONS[note.col % 5]
  const base = `/skin/${skin}`
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <img
        src={`${base}/${dir}-Tap-Note.png`}
        draggable={false}
        className="absolute pointer-events-none"
        style={{ left: x, top: note.row * rh, width: cw, height: cw, transform: 'translateY(-50%)', opacity }}
      />
    )
  }

  const endRow = note.endRow ?? note.row
  const bodyTop = note.row * rh
  // Хвостовой кэп центрирован на линии хвоста (endRow*rh), как нота на хит-линии.
  // Тело тянется до ВЕРХНЕЙ грани кэпа (endRow*rh - cw/2), иначе оно просвечивало бы
  // сквозь полупрозрачную верхнюю часть кэпа.
  const bodyBot = note.continues ? totalRows * rh : endRow * rh - cw / 2
  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{
          left: x, top: bodyTop, width: cw, height: Math.max(0, bodyBot - bodyTop),
          backgroundImage: `url(${base}/${dir}-Hold-Body.png)`,
          backgroundSize: `${cw}px auto`,
          backgroundRepeat: 'repeat-y',
          opacity,
        }}
      />
      {!note.continues && (
        <img
          src={`${base}/${dir}-Hold-BottomCap.png`}
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: x, top: endRow * rh, width: cw, height: cw, transform: 'translateY(-50%)', opacity }}
        />
      )}
      {!note.continued && (
        <img
          src={`${base}/${dir}-Tap-Note.png`}
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: x, top: note.row * rh, width: cw, height: cw, transform: 'translateY(-50%)', opacity, zIndex: 1 }}
        />
      )}
    </>
  )
}

function BlocksSprite({ note, rh, cw, totalRows, ghost }: { note: Note; rh: number; cw: number; totalRows: number; ghost?: boolean }) {
  const x = note.col * cw
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <div
        className="absolute rounded-sm bg-blue-400 border border-blue-300 shadow-sm pointer-events-none"
        style={{ left: x + 1, top: note.row * rh, width: cw - 2, height: rh, transform: 'translateY(-50%)', opacity }}
      />
    )
  }

  const endRow = note.endRow ?? note.row
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
  previewNote: Note | null
}

// Один блок: только ноты (сетка вынесена в отдельный GridBlock-слой). Мемоизирован
// и не зависит от прокрутки — во время playback не ре-рендерится вовсе (двигается
// только transform родителя).
export const BlockLayer = memo(function BlockLayer({ block, startY, rh, cw, totalRows, height, notesWidth, previewNote }: Props) {
  const skin = useEditorStore(s => s.activeSkin)
  const isBlocks = skin === 'blocks'

  return (
    <div className="absolute left-0" style={{ top: startY, width: notesWidth, height }}>
      {block.notes.map((note, i) =>
        isBlocks
          ? <BlocksSprite key={i} note={note} rh={rh} cw={cw} totalRows={totalRows} />
          : <ImageSprite key={i} note={note} rh={rh} cw={cw} totalRows={totalRows} skin={skin} />
      )}
      {previewNote && (isBlocks
        ? <BlocksSprite note={previewNote} rh={rh} cw={cw} totalRows={totalRows} ghost />
        : <ImageSprite note={previewNote} rh={rh} cw={cw} totalRows={totalRows} skin={skin} ghost />)}
    </div>
  )
})
