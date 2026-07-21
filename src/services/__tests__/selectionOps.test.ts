import { describe, it, expect, beforeEach } from 'vitest'
import type { Block, Chart, Note } from '@/types/chart'
import {
  deleteSelection,
  copySelection,
  pasteClipboard,
  flipSelection,
  clearClipboard,
  hasClipboard,
} from '../selectionOps'

let seq = 0
function makeBlock(notes: Note[], rows = 16): Block {
  return {
    id: `b${++seq}`,
    bpm: 120,
    delay: 0,
    beat: 4,
    split: 4,
    measures: rows / 16,
    rowCount: rows,
    notes,
  }
}

function makeChart(blocks: Block[]): Chart {
  return {
    id: 'c1',
    version: 1,
    meta: { title: '', artist: '' },
    chartType: 'Single',
    difficulty: 1,
    blocks,
  }
}

beforeEach(() => {
  seq = 0
  clearClipboard()
})

describe('deleteSelection', () => {
  it('удаляет ноты в диапазоне строк, не трогая остальные', () => {
    const b = makeBlock([
      { row: 1, col: 0, type: 'tap' },
      { row: 5, col: 1, type: 'tap' },
      { row: 10, col: 2, type: 'tap' },
    ])
    const chart = makeChart([b])
    const next = deleteSelection(chart, { kind: 'rows', blockId: b.id, fromRow: 4, toRow: 6 })!
    expect(next.blocks[0].notes.map(n => n.row)).toEqual([1, 10])
  })

  it('холд, частично пересекающий диапазон, удаляется целиком', () => {
    const b = makeBlock([{ row: 2, col: 0, type: 'hold', endRow: 8 }])
    const chart = makeChart([b])
    const next = deleteSelection(chart, { kind: 'rows', blockId: b.id, fromRow: 7, toRow: 9 })!
    expect(next.blocks[0].notes).toHaveLength(0)
  })

  it('кросс-блочная цепочка удаляется во всех блоках', () => {
    const b1 = makeBlock([{ row: 10, col: 3, type: 'hold', endRow: 15, continues: true }])
    const b2 = makeBlock([{ row: 0, col: 3, type: 'hold', endRow: 4, continued: true }])
    const chart = makeChart([b1, b2])
    const next = deleteSelection(chart, { kind: 'rows', blockId: b2.id, fromRow: 0, toRow: 1 })!
    expect(next.blocks[0].notes).toHaveLength(0)
    expect(next.blocks[1].notes).toHaveLength(0)
  })

  it('block: удаляет блок и снимает зависшие флаги у соседей', () => {
    const b1 = makeBlock([{ row: 10, col: 3, type: 'hold', endRow: 15, continues: true }])
    const b2 = makeBlock([{ row: 0, col: 3, type: 'hold', endRow: 15, continued: true, continues: true }])
    const b3 = makeBlock([{ row: 0, col: 3, type: 'hold', endRow: 4, continued: true }])
    const chart = makeChart([b1, b2, b3])
    const next = deleteSelection(chart, { kind: 'block', blockId: b2.id })!
    expect(next.blocks).toHaveLength(2)
    // Цепочка реконнектится через вырез: continues/continued остаются валидной парой
    expect(next.blocks[0].notes[0].continues).toBe(true)
    expect(next.blocks[1].notes[0].continued).toBe(true)
  })

  it('block: единственный блок не удаляется — чистятся ноты', () => {
    const b = makeBlock([{ row: 1, col: 0, type: 'tap' }])
    const chart = makeChart([b])
    const next = deleteSelection(chart, { kind: 'block', blockId: b.id })!
    expect(next.blocks).toHaveLength(1)
    expect(next.blocks[0].notes).toHaveLength(0)
  })
})

describe('copy / paste', () => {
  it('копирует диапазон с относительными row и вставляет от целевой строки', () => {
    const b = makeBlock([
      { row: 4, col: 0, type: 'tap' },
      { row: 6, col: 2, type: 'hold', endRow: 7 },
    ])
    const chart = makeChart([b])
    expect(copySelection(chart, { kind: 'rows', blockId: b.id, fromRow: 4, toRow: 7 })).toBe(true)
    expect(hasClipboard()).toBe(true)

    const res = pasteClipboard(chart, 5, { blockIdx: 0, row: 10 }, false)!
    const notes = [...res.chart.blocks[0].notes].sort((a, b2) => a.row - b2.row)
    expect(notes).toHaveLength(4)
    expect(notes[2]).toMatchObject({ row: 10, col: 0, type: 'tap' })
    expect(notes[3]).toMatchObject({ row: 12, col: 2, type: 'hold', endRow: 13 })
    expect(res.selection).toMatchObject({ kind: 'rows', fromRow: 10, toRow: 13 })
  })

  it('вставка заменяет перекрытые ноты и обрезает хвост за концом блока', () => {
    const b = makeBlock([
      { row: 0, col: 0, type: 'tap' },
      { row: 8, col: 0, type: 'tap' },
      { row: 14, col: 1, type: 'tap' },
    ])
    const chart = makeChart([b])
    copySelection(chart, { kind: 'rows', blockId: b.id, fromRow: 0, toRow: 15 })

    const res = pasteClipboard(chart, 5, { blockIdx: 0, row: 8 }, false)!
    const notes = [...res.chart.blocks[0].notes].sort((a, b2) => a.row - b2.row)
    // tap row8 col0 заменён вставленной копией tap row0 (легла на ту же ячейку);
    // копии tap row8 → 16 и tap row14 → 22 обрезаны концом блока (16 строк)
    expect(notes.map(n => n.row)).toEqual([0, 8, 14])
    expect(notes).toHaveLength(3)
  })

  it('повторная вставка со сдвигом уходит на колонку дальше (с заворотом)', () => {
    const b = makeBlock([{ row: 0, col: 4, type: 'tap' }])
    const chart = makeChart([b])
    copySelection(chart, { kind: 'rows', blockId: b.id, fromRow: 0, toRow: 0 })

    const first = pasteClipboard(chart, 5, { blockIdx: 0, row: 4 }, true)!
    const n1 = first.chart.blocks[0].notes.find(n => n.row === 4)!
    expect(n1.col).toBe(0) // 4+1 mod 5

    const second = pasteClipboard(first.chart, 5, { blockIdx: 0, row: 8 }, true)!
    const n2 = second.chart.blocks[0].notes.find(n => n.row === 8)!
    expect(n2.col).toBe(1) // offset накапливается
  })

  it('block-клипборд вставляет копию блока после целевого', () => {
    const b1 = makeBlock([{ row: 3, col: 2, type: 'tap' }])
    const b2 = makeBlock([])
    const chart = makeChart([b1, b2])
    copySelection(chart, { kind: 'block', blockId: b1.id })

    const res = pasteClipboard(chart, 5, { blockIdx: 1, row: 0 }, false)!
    expect(res.chart.blocks).toHaveLength(3)
    expect(res.chart.blocks[2].notes[0]).toMatchObject({ row: 3, col: 2 })
    expect(res.chart.blocks[2].id).not.toBe(b1.id)
    expect(res.selection).toMatchObject({ kind: 'block', blockId: res.chart.blocks[2].id })
  })
})

describe('flipSelection', () => {
  it('X зеркалит колонки в диапазоне', () => {
    const b = makeBlock([
      { row: 2, col: 0, type: 'tap' },
      { row: 12, col: 0, type: 'tap' }, // вне диапазона
    ])
    const chart = makeChart([b])
    const next = flipSelection(chart, { kind: 'rows', blockId: b.id, fromRow: 0, toRow: 7 }, 'h', 5)!
    const notes = [...next.blocks[0].notes].sort((a, b2) => a.row - b2.row)
    expect(notes[0].col).toBe(4)
    expect(notes[1].col).toBe(0)
  })

  it('Y зеркалит верх/низ внутри пятёрки, время не трогает: `*.*.*` → `.***.`', () => {
    const b = makeBlock([
      { row: 3, col: 0, type: 'tap' },
      { row: 3, col: 2, type: 'tap' },
      { row: 3, col: 4, type: 'tap' },
    ])
    const chart = makeChart([b])
    const next = flipSelection(chart, { kind: 'block', blockId: b.id }, 'v', 5)!
    const cols = next.blocks[0].notes.map(n => n.col).sort((a, b2) => a - b2)
    expect(cols).toEqual([1, 2, 3])
    expect(next.blocks[0].notes.every(n => n.row === 3)).toBe(true)
  })

  it('Y на холде — меняет колонку, row/endRow не трогает', () => {
    const b = makeBlock([{ row: 1, col: 0, type: 'hold', endRow: 3 }])
    const chart = makeChart([b])
    const next = flipSelection(chart, { kind: 'block', blockId: b.id }, 'v', 5)!
    expect(next.blocks[0].notes[0]).toMatchObject({ row: 1, endRow: 3, col: 1 })
  })

  it('M — точечное отражение диаманта колонок, строки не трогает', () => {
    // DownLeft(0) ⇄ UpRight(3), UpLeft(1) ⇄ DownRight(4), Center(2) на месте —
    // сверено с разбором эталона (StepEdit_Lite.exe): M НЕ равен X+Y.
    const b = makeBlock([
      { row: 5, col: 0, type: 'tap' },
      { row: 6, col: 1, type: 'tap' },
      { row: 7, col: 2, type: 'tap' },
    ])
    const chart = makeChart([b])
    const next = flipSelection(chart, { kind: 'block', blockId: b.id }, 'm', 5)!
    const notes = [...next.blocks[0].notes].sort((a, b2) => a.row - b2.row)
    expect(notes[0]).toMatchObject({ row: 5, col: 3 })
    expect(notes[1]).toMatchObject({ row: 6, col: 4 })
    expect(notes[2]).toMatchObject({ row: 7, col: 2 })
  })

  it('M на Double — тот же диамант в каждой из двух пятёрок + P1⇄P2', () => {
    const b = makeBlock([
      { row: 0, col: 0, type: 'tap' }, // P1 DownLeft
      { row: 1, col: 4, type: 'tap' }, // P1 DownRight
      { row: 2, col: 7, type: 'tap' }, // P2 Center
    ])
    const chart = makeChart([b])
    const next = flipSelection(chart, { kind: 'block', blockId: b.id }, 'm', 10)!
    const notes = [...next.blocks[0].notes].sort((a, b2) => a.row - b2.row)
    expect(notes[0]).toMatchObject({ row: 0, col: 8 }) // P2 UpRight
    expect(notes[1]).toMatchObject({ row: 1, col: 6 }) // P2 UpLeft
    expect(notes[2]).toMatchObject({ row: 2, col: 2 }) // P1 Center
  })

  it('кросс-блочные холды не трогаются', () => {
    const b = makeBlock([
      { row: 10, col: 0, type: 'hold', endRow: 15, continues: true },
      { row: 2, col: 1, type: 'tap' },
    ])
    const chart = makeChart([b, makeBlock([{ row: 0, col: 0, type: 'hold', endRow: 3, continued: true }])])
    const next = flipSelection(chart, { kind: 'block', blockId: b.id }, 'h', 5)!
    const hold = next.blocks[0].notes.find(n => n.type === 'hold')!
    expect(hold.col).toBe(0) // не перевёрнут
    const tap = next.blocks[0].notes.find(n => n.type === 'tap')!
    expect(tap.col).toBe(3)
  })
})
