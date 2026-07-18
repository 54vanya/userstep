// Экспорт в формат StepMania .sm.
//
// Маппинг модели на формат:
// - Таймлайн — в битах SM: строка блока занимает 1/split бита (60/bpm сек — бит),
//   блоки идут встык; UCS Beat на тайминг не влияет (только на сетку редактора),
//   такты SM всегда по 4 бита. Позиции держим точными дробями — float накапливал
//   бы ошибку на длинных чартах.
// - BPM блока → #BPMS (beat=bpm, слияние одинаковых соседних).
// - Delay первого блока (тишина до старта) → #OFFSET (отрицательный: нота бита 0
//   звучит позже старта музыки).
// - Delay последующих блоков → #DELAYS (beat=секунды): в отличие от #STOPS, нота
//   на бите паузы играет ПОСЛЕ неё — ровно семантика UCS Delay (SM ввела Delays
//   именно под Pump It Up).
// - Ноты: '1' = tap, '2' = голова холда, '3' = хвост; кросс-блочная цепочка
//   (continues/continued) даёт одну пару 2…3 — промежуточные части не пишутся.
// - Такт: число строк = 4×LCM знаменателей позиций нот в нём (кратно битам);
//   если требуется больше 192 строк (гиммик-сплиты вроде 128), квантуем на сетку
//   192-х (48 позиций на бит — внутренняя сетка SM), коллизии схлопываются.
import type { Chart } from '@/types/chart'
import { chartCols } from '@/types/chart'
import { blockRowCount } from '@/utils/geometry'

// ---- точные дроби (позиции битов) ----

interface Frac { n: number; d: number }

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function frac(n: number, d: number): Frac {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1
  return { n: n / g, d: d / g }
}

function addFrac(a: Frac, b: Frac): Frac {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d)
}

function toNumber(f: Frac): number {
  return f.n / f.d
}

// Десятичная запись без хвостовых нулей (биты/секунды в заголовках).
function fmt(x: number): string {
  return String(Math.round(x * 1e6) / 1e6)
}

// Экранирование спецсимволов SM в текстовых полях (\: \; \\ и маркер комментария).
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/;/g, '\\;').replace(/\/\//g, '\\/\\/')
}

// ---- события нот на общем таймлайне ----

interface NoteEvent { beat: Frac; col: number; ch: '1' | '2' | '3' }

const MAX_LINES_PER_MEASURE = 192 // предел SM: 48 позиций на бит

export function serializeToSm(chart: Chart): string {
  const cols = chartCols(chart)
  const chartType = cols === 10 ? 'pump-double' : 'pump-single'

  const bpms: { beat: Frac; bpm: number }[] = []
  const delays: { beat: Frac; sec: number }[] = []
  const events: NoteEvent[] = []

  let startBeat: Frac = { n: 0, d: 1 }
  chart.blocks.forEach((block, i) => {
    if (i === 0 || block.bpm !== chart.blocks[i - 1].bpm) {
      bpms.push({ beat: startBeat, bpm: block.bpm })
    }
    if (i > 0 && block.delay !== 0) {
      delays.push({ beat: startBeat, sec: block.delay / 1000 })
    }

    const rows = blockRowCount(block)
    const beatOf = (row: number) => addFrac(startBeat, frac(row, block.split))
    for (const note of block.notes) {
      if (note.col >= cols || note.row >= rows) continue
      if (note.type === 'tap') {
        events.push({ beat: beatOf(note.row), col: note.col, ch: '1' })
        continue
      }
      const endRow = Math.min(note.endRow ?? note.row, rows - 1)
      // Вырожденный холд нулевой длины без цепочки — обычный tap.
      if (endRow === note.row && !note.continued && !note.continues) {
        events.push({ beat: beatOf(note.row), col: note.col, ch: '1' })
        continue
      }
      // Кросс-блочная цепочка: голова пишется только у стартовой части,
      // хвост — только у финальной; промежуточные части не дают событий.
      if (!note.continued) events.push({ beat: beatOf(note.row), col: note.col, ch: '2' })
      if (!note.continues) events.push({ beat: beatOf(endRow), col: note.col, ch: '3' })
    }

    startBeat = addFrac(startBeat, frac(rows, block.split))
  })

  const totalBeats = toNumber(startBeat)
  const measureCount = Math.max(1, Math.ceil(totalBeats / 4 - 1e-9))

  // ---- такты ----
  const measures: string[] = []
  for (let m = 0; m < measureCount; m++) {
    // События такта: 4m <= beat < 4m+4 (точное сравнение на дробях).
    const inMeasure = events
      .map(e => ({ ...e, off: frac(e.beat.n - 4 * m * e.beat.d, e.beat.d) }))
      .filter(e => e.off.n >= 0 && e.off.n < 4 * e.off.d)

    // Строк в такте: 4 бита × LCM знаменателей позиций (позиция = биты от начала
    // такта). Выше предела — квантуем на 48 позиций/бит.
    let perBeat = 1
    for (const e of inMeasure) {
      perBeat = (perBeat * e.off.d) / gcd(perBeat, e.off.d)
      if (perBeat * 4 > MAX_LINES_PER_MEASURE) { perBeat = MAX_LINES_PER_MEASURE / 4; break }
    }
    const lines = 4 * perBeat
    const grid: string[][] = Array.from({ length: lines }, () => Array(cols).fill('0'))

    for (const e of inMeasure) {
      const idx = Math.min(lines - 1, Math.max(0, Math.round(toNumber(e.off) * perBeat)))
      const prev = grid[idx][e.col]
      // Коллизии возможны только после квантования: пара голова+хвост в одной
      // ячейке вырождается в tap, иначе маркеры холда приоритетнее tap'а.
      grid[idx][e.col] =
        prev === '0' ? e.ch
        : (prev === '2' && e.ch === '3') || (prev === '3' && e.ch === '2') ? '1'
        : prev === '1' ? e.ch
        : prev
    }

    measures.push(grid.map(r => r.join('')).join('\n'))
  }

  const header = [
    `#TITLE:${esc(chart.meta.title)};`,
    `#ARTIST:${esc(chart.meta.artist)};`,
    `#MUSIC:${esc(chart.audioFileName ?? '')};`,
    `#OFFSET:${fmt(-(chart.blocks[0]?.delay ?? 0) / 1000)};`,
    `#BPMS:${bpms.map(b => `${fmt(toNumber(b.beat))}=${fmt(b.bpm)}`).join(',')};`,
    '#STOPS:;',
    `#DELAYS:${delays.map(d => `${fmt(toNumber(d.beat))}=${fmt(d.sec)}`).join(',')};`,
  ]

  const notes = [
    '#NOTES:',
    `     ${chartType}:`,
    '     :',
    '     Edit:',
    `     ${chart.difficulty}:`,
    '     0,0,0,0,0:',
    measures.join('\n,\n'),
    ';',
  ]

  return [...header, '', ...notes].join('\n') + '\n'
}
