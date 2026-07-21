// Операции над выделением (модель StepEdit Lite): удаление, внутренний клипборд
// (Ctrl+C/X/V + вставка со сдвигом колонок), трансформации X/Y/M.
// Все функции чистые над Chart: возвращают новый Chart (или null, если операция
// неприменима) — один вызов updateChart = один undo-снэпшот.
import { v4 as uuidv4 } from 'uuid'
import type { Block, Chart, Note } from '@/types/chart'
import type { Selection } from '@/store/editorStore'
import { blockRowCount } from '@/utils/geometry'
import { collectHoldChain, noteEnd, sanitizeHoldFlags } from '@/utils/holds'

// ── Клипборд (внутренний, живёт в памяти приложения) ────────────────────────

// rows — ноты с row относительно начала скопированного диапазона; block —
// глубокая копия блока целиком (флаги цепочек сняты: копия самодостаточна).
type RowsClip = { kind: 'rows'; rows: number; notes: Note[] }
type BlockClip = { kind: 'block'; block: Block }

let clip: RowsClip | BlockClip | null = null
// Сдвиг колонок «повторной вставки»: каждый Ctrl+Shift+V сдвигает ещё на одну
// колонку (с заворотом), Ctrl+V и новая копия сбрасывают в 0.
let pasteOffset = 0

export function hasClipboard(): boolean {
  return clip !== null
}

// Для тестов/отладки.
export function clearClipboard(): void {
  clip = null
  pasteOffset = 0
}

// ── Хелперы ──────────────────────────────────────────────────────────────────

function spanIntersects(n: Note, from: number, to: number): boolean {
  return noteEnd(n) >= from && n.row <= to
}

function notesCollide(a: Note, b: Note): boolean {
  return a.col === b.col && noteEnd(a) >= b.row && a.row <= noteEnd(b)
}

function stripChainFlags(n: Note): Note {
  if (n.type !== 'hold' || (!n.continued && !n.continues)) return { ...n }
  const nn = { ...n }
  delete nn.continued
  delete nn.continues
  return nn
}

// ── Delete ───────────────────────────────────────────────────────────────────

// rows: удаляет все ноты, пересекающие диапазон (кросс-блочные холды — целыми
// цепочками, как клик-удаление). block: удаляет сам блок (единственный блок не
// удаляем — чистим его ноты).
export function deleteSelection(chart: Chart, sel: Selection): Chart | null {
  const idx = chart.blocks.findIndex(b => b.id === sel.blockId)
  if (idx < 0) return null

  if (sel.kind === 'block') {
    if (chart.blocks.length <= 1) {
      const only = chart.blocks[0]
      if (only.notes.length === 0) return null
      return { ...chart, blocks: [{ ...only, notes: [] }] }
    }
    const blocks = sanitizeHoldFlags(chart.blocks.filter(b => b.id !== sel.blockId))
    return { ...chart, blocks }
  }

  const block = chart.blocks[idx]
  const doomed = block.notes.filter(n => spanIntersects(n, sel.fromRow, sel.toRow))
  if (doomed.length === 0) return null

  const doomedPerBlock = new Map<number, Set<Note>>()
  const mark = (i: number, n: Note) => {
    if (!doomedPerBlock.has(i)) doomedPerBlock.set(i, new Set())
    doomedPerBlock.get(i)!.add(n)
  }
  for (const n of doomed) {
    if (n.type === 'hold' && (n.continued || n.continues)) {
      for (const part of collectHoldChain(chart.blocks, idx, n.col)) mark(part.idx, part.note)
    } else {
      mark(idx, n)
    }
  }
  const blocks = chart.blocks.map((b, i) => {
    const set = doomedPerBlock.get(i)
    return set ? { ...b, notes: b.notes.filter(n => !set.has(n)) } : b
  })
  return { ...chart, blocks: sanitizeHoldFlags(blocks) }
}

// ── Copy / Cut ───────────────────────────────────────────────────────────────

// Холды, частично попавшие в диапазон, обрезаются по нему; выродившийся в одну
// строку холд становится tap (холд нулевой длины не сериализуем).
export function copySelection(chart: Chart, sel: Selection): boolean {
  const block = chart.blocks.find(b => b.id === sel.blockId)
  if (!block) return false
  pasteOffset = 0

  if (sel.kind === 'block') {
    clip = {
      kind: 'block',
      block: { ...block, id: uuidv4(), notes: block.notes.map(stripChainFlags) },
    }
    return true
  }

  const notes: Note[] = []
  for (const n of block.notes) {
    if (!spanIntersects(n, sel.fromRow, sel.toRow)) continue
    if (n.type === 'tap') {
      notes.push({ row: n.row - sel.fromRow, col: n.col, type: 'tap' })
      continue
    }
    const start = Math.max(n.row, sel.fromRow) - sel.fromRow
    const end = Math.min(noteEnd(n), sel.toRow) - sel.fromRow
    notes.push(start === end
      ? { row: start, col: n.col, type: 'tap' }
      : { row: start, col: n.col, type: 'hold', endRow: end })
  }
  clip = { kind: 'rows', rows: sel.toRow - sel.fromRow + 1, notes }
  return true
}

// ── Paste ────────────────────────────────────────────────────────────────────

interface PasteTarget {
  blockIdx: number
  row: number
}

// rows-клипборд кладёт ноты от target.row (перекрытые существующие ноты в
// затронутых ячейках удаляются, хвост за концом блока обрезается); block-клипборд
// вставляет копию блока после target-блока. withOffset — сдвиг колонок +1 за
// нажатие (с заворотом по ширине чарта).
export function pasteClipboard(
  chart: Chart,
  cols: number,
  target: PasteTarget,
  withOffset: boolean,
): { chart: Chart; selection: Selection } | null {
  if (!clip) return null
  pasteOffset = withOffset ? (pasteOffset + 1) % cols : 0
  const off = pasteOffset

  if (clip.kind === 'block') {
    const src = clip.block
    const copy: Block = {
      ...src,
      id: uuidv4(),
      notes: src.notes
        .filter(n => n.col < cols)
        .map(n => ({ ...n, col: (n.col + off) % cols })),
    }
    const blocks = [...chart.blocks]
    blocks.splice(target.blockIdx + 1, 0, copy)
    return {
      chart: { ...chart, blocks },
      selection: { kind: 'block', blockId: copy.id },
    }
  }

  const block = chart.blocks[target.blockIdx]
  if (!block) return null
  const total = blockRowCount(block)
  const pasted: Note[] = []
  for (const n of clip.notes) {
    if (n.col >= cols) continue
    const col = (n.col + off) % cols
    const row = target.row + n.row
    if (row >= total) continue
    if (n.type === 'tap') {
      pasted.push({ row, col, type: 'tap' })
      continue
    }
    const end = Math.min(total - 1, target.row + noteEnd(n))
    pasted.push(end === row
      ? { row, col, type: 'tap' }
      : { row, col, type: 'hold', endRow: end })
  }
  if (pasted.length === 0) return null

  const kept = block.notes.filter(ex => !pasted.some(nn => notesCollide(ex, nn)))
  const blocks = chart.blocks.map((b, i) =>
    i === target.blockIdx ? { ...b, notes: [...kept, ...pasted] } : b)
  return {
    chart: { ...chart, blocks },
    selection: {
      kind: 'rows',
      blockId: block.id,
      fromRow: target.row,
      toRow: Math.min(total - 1, target.row + clip.rows - 1),
    },
  }
}

// ── Flip X / Y / Mirror ──────────────────────────────────────────────────────

export type FlipMode = 'h' | 'v' | 'm'

// Панели идут пятёрками DownLeft/UpLeft/Center/UpRight/DownRight на игрока
// (SPRITE_DIRECTIONS), Double — две пятёрки подряд. Все три режима — чистые
// перестановки КОЛОНОК внутри своей строки, время (row/endRow) не трогают:
// X — зеркало лево/право на всю ширину чарта (col → cols-1-col);
// Y — зеркало верх/низ внутри своей пятёрки: DL⇄UL, DR⇄UR, C на месте.
// Первая версия Y делала реверс строк по времени — не совпадало ни с
// подписью «Flip vertical»/иконкой FlipVertical2 в сайдбаре, ни с ожиданием
// юзера (паттерн `*.*.*` на всю ширину single должен становиться `.***.` —
// ровно результат udSwapLocal, а не палиндромный реверс);
// M — оба сразу, 180°-поворот диаманта (DL⇄UR, UL⇄DR, C на месте) — не
// сводится к «сделать X, потом Y» построчно во времени, отдельная перестановка
// (сверено разбором эталона StepEdit_Lite.exe: там тоже жёсткая таблица без
// реверса строк, X и M различаются как раз в этом).
function udSwapLocal(col: number): number {
  const local = col % 5
  const swapped = local === 0 ? 1 : local === 1 ? 0 : local === 3 ? 4 : local === 4 ? 3 : 2
  return col - local + swapped
}

function mirror180Col(col: number, cols: number): number {
  return cols - 1 - udSwapLocal(col)
}

// Трансформируются только ноты целиком внутри диапазона выделения;
// кросс-блочные цепочки не трогаем (их не развернуть в пределах одного
// блока). Перевёрнутые ноты, столкнувшиеся с пропущенными, отбрасываются.
export function flipSelection(chart: Chart, sel: Selection, mode: FlipMode, cols: number): Chart | null {
  const idx = chart.blocks.findIndex(b => b.id === sel.blockId)
  if (idx < 0) return null
  const block = chart.blocks[idx]
  const total = blockRowCount(block)
  const from = sel.kind === 'block' ? 0 : sel.fromRow
  const to = sel.kind === 'block' ? total - 1 : sel.toRow

  const kept: Note[] = []
  const moved: Note[] = []
  for (const n of block.notes) {
    const inside = n.row >= from && noteEnd(n) <= to
      && !(n.type === 'hold' && (n.continued || n.continues))
    if (!inside) {
      kept.push(n)
      continue
    }
    const nn: Note = { ...n }
    if (mode === 'h') nn.col = cols - 1 - nn.col
    else if (mode === 'v') nn.col = udSwapLocal(nn.col)
    else nn.col = mirror180Col(nn.col, cols)
    moved.push(nn)
  }
  if (moved.length === 0) return null

  const survivors = moved.filter(m => !kept.some(k => notesCollide(k, m)))
  const blocks = chart.blocks.map((b, i) =>
    i === idx ? { ...b, notes: [...kept, ...survivors] } : b)
  return { ...chart, blocks }
}
