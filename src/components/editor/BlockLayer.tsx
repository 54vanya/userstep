import { memo } from 'react'
import { COLUMN_WIDTH } from '@/utils/geometry'
import { useEditorStore } from '@/store/editorStore'
import type { Block, Note } from '@/types/chart'

const DIRECTIONS = ['DownLeft', 'UpLeft', 'Center', 'UpRight', 'DownRight']

// Линии сетки одним фоном на блок (вместо построчных border-div). Три слоя
// repeating-linear-gradient: measure поверх beat поверх sub (на совпадающих
// позициях выигрывает верхний). Опционально вертикальные делители колонок.
function buildGridBackground(block: Block, rh: number, showCols: boolean): string {
  const line = (period: number, color: string, dir: 'bottom' | 'right') => {
    const a = Math.max(0, period - 1)
    return `repeating-linear-gradient(to ${dir}, transparent 0, transparent ${a}px, ${color} ${a}px, ${color} ${period}px)`
  }
  const layers = [
    line(rh * block.split * block.beat, 'var(--color-grid-measure)', 'bottom'),
    line(rh * block.split, 'var(--color-grid-beat)', 'bottom'),
    line(rh, 'var(--color-grid-sub)', 'bottom'),
  ]
  if (showCols) layers.push(line(COLUMN_WIDTH, 'var(--color-grid-beat)', 'right'))
  return layers.join(', ')
}

// Одна нота как спрайт (вместо построчных ячеек). Для холда — единый body на весь
// пролёт + шапка/кэп по флагам continued/continues (включая кросс-блочные холды).
function ImageSprite({ note, rh, totalRows, skin, ghost }: { note: Note; rh: number; totalRows: number; skin: string; ghost?: boolean }) {
  const x = note.col * COLUMN_WIDTH
  const dir = DIRECTIONS[note.col % 5]
  const base = `/skin/${skin}`
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <img
        src={`${base}/${dir}-Tap-Note.png`}
        draggable={false}
        className="absolute pointer-events-none"
        style={{ left: x, top: note.row * rh, width: COLUMN_WIDTH, height: COLUMN_WIDTH, transform: 'translateY(-50%)', opacity }}
      />
    )
  }

  const endRow = note.endRow ?? note.row
  const bodyTop = note.row * rh
  const bodyBot = note.continues ? totalRows * rh : endRow * rh
  return (
    <>
      <div
        className="absolute pointer-events-none"
        style={{
          left: x, top: bodyTop, width: COLUMN_WIDTH, height: Math.max(0, bodyBot - bodyTop),
          backgroundImage: `url(${base}/${dir}-Hold-Body.png)`,
          backgroundSize: `${COLUMN_WIDTH}px auto`,
          backgroundRepeat: 'repeat-y',
          opacity,
        }}
      />
      {!note.continues && (
        <img
          src={`${base}/${dir}-Hold-BottomCap.png`}
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: x, top: endRow * rh, width: COLUMN_WIDTH, height: COLUMN_WIDTH, opacity }}
        />
      )}
      {!note.continued && (
        <img
          src={`${base}/${dir}-Tap-Note.png`}
          draggable={false}
          className="absolute pointer-events-none"
          style={{ left: x, top: note.row * rh, width: COLUMN_WIDTH, height: COLUMN_WIDTH, transform: 'translateY(-50%)', opacity, zIndex: 1 }}
        />
      )}
    </>
  )
}

function BlocksSprite({ note, rh, totalRows, ghost }: { note: Note; rh: number; totalRows: number; ghost?: boolean }) {
  const x = note.col * COLUMN_WIDTH
  const opacity = ghost ? 0.5 : undefined

  if (note.type === 'tap') {
    return (
      <div
        className="absolute rounded-sm bg-blue-400 border border-blue-300 shadow-sm pointer-events-none"
        style={{ left: x + 1, top: note.row * rh, width: COLUMN_WIDTH - 2, height: rh, opacity }}
      />
    )
  }

  const endRow = note.endRow ?? note.row
  const top = note.row * rh
  const bot = note.continues ? totalRows * rh : (endRow + 1) * rh
  const roundTop = !note.continued
  const roundBot = !note.continues
  return (
    <div
      className="absolute bg-green-600 border-x border-green-400 pointer-events-none"
      style={{
        left: x + 1, top, width: COLUMN_WIDTH - 2, height: Math.max(0, bot - top), opacity,
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
  totalRows: number
  height: number
  notesWidth: number
  previewNote: Note | null
}

// Один блок: фон-сетка + все ноты. Мемоизирован и не зависит от прокрутки —
// во время playback не ре-рендерится вовсе (двигается только transform родителя).
export const BlockLayer = memo(function BlockLayer({ block, startY, rh, totalRows, height, notesWidth, previewNote }: Props) {
  const showCols = useEditorStore(s => s.showColumnDividers)
  const skin = useEditorStore(s => s.activeSkin)
  const isBlocks = skin === 'blocks'

  return (
    <div className="absolute left-0" style={{ top: startY, width: notesWidth, height }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: buildGridBackground(block, rh, showCols) }} />
      {block.notes.map((note, i) =>
        isBlocks
          ? <BlocksSprite key={i} note={note} rh={rh} totalRows={totalRows} />
          : <ImageSprite key={i} note={note} rh={rh} totalRows={totalRows} skin={skin} />
      )}
      {previewNote && (isBlocks
        ? <BlocksSprite note={previewNote} rh={rh} totalRows={totalRows} ghost />
        : <ImageSprite note={previewNote} rh={rh} totalRows={totalRows} skin={skin} ghost />)}
    </div>
  )
})
