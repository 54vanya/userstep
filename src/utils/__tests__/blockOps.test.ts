import { describe, it, expect } from 'vitest'
import type { Block, Chart, Note } from '@/types/chart'
import { splitBlockAt, mergeWithNext, deleteBelow } from '../blockOps'

let seq = 0
function makeBlock(notes: Note[], rows = 16, split = 4): Block {
  return {
    id: `b${++seq}`,
    bpm: 120,
    delay: 0,
    beat: 4,
    split,
    measures: rows / (4 * split),
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

describe('splitBlockAt', () => {
  it('делит строки и ноты между двумя блоками', () => {
    const b = makeBlock([
      { row: 2, col: 0, type: 'tap' },
      { row: 10, col: 1, type: 'tap' },
    ])
    const next = splitBlockAt(makeChart([b]), b.id, 8)!
    expect(next.blocks).toHaveLength(2)
    expect(next.blocks[0].rowCount).toBe(8)
    expect(next.blocks[1].rowCount).toBe(8)
    expect(next.blocks[0].notes).toEqual([{ row: 2, col: 0, type: 'tap' }])
    expect(next.blocks[1].notes).toEqual([{ row: 2, col: 1, type: 'tap' }])
    expect(next.blocks[1].delay).toBe(0)
  })

  it('холд через разрез становится цепочкой continues/continued', () => {
    const b = makeBlock([{ row: 4, col: 2, type: 'hold', endRow: 12 }])
    const next = splitBlockAt(makeChart([b]), b.id, 8)!
    expect(next.blocks[0].notes[0]).toMatchObject({ row: 4, endRow: 7, continues: true })
    expect(next.blocks[1].notes[0]).toMatchObject({ row: 0, endRow: 4, continued: true })
  })

  it('row за пределами блока — no-op', () => {
    const b = makeBlock([])
    expect(splitBlockAt(makeChart([b]), b.id, 0)).toBeNull()
    expect(splitBlockAt(makeChart([b]), b.id, 16)).toBeNull()
  })
})

describe('mergeWithNext', () => {
  it('конкатенирует ноты со сдвигом строк', () => {
    const a = makeBlock([{ row: 2, col: 0, type: 'tap' }])
    const b = makeBlock([{ row: 3, col: 1, type: 'tap' }])
    const next = mergeWithNext(makeChart([a, b]), a.id)!
    expect(next.blocks).toHaveLength(1)
    expect(next.blocks[0].rowCount).toBe(32)
    const rows = next.blocks[0].notes.map(n => n.row).sort((x, y) => x - y)
    expect(rows).toEqual([2, 19])
  })

  it('склеивает парную цепочку в один холд', () => {
    const a = makeBlock([{ row: 10, col: 3, type: 'hold', endRow: 15, continues: true }])
    const b = makeBlock([{ row: 0, col: 3, type: 'hold', endRow: 5, continued: true }])
    const next = mergeWithNext(makeChart([a, b]), a.id)!
    expect(next.blocks[0].notes).toHaveLength(1)
    const hold = next.blocks[0].notes[0]
    expect(hold).toMatchObject({ row: 10, endRow: 21, col: 3 })
    expect(hold.continues).toBeUndefined()
    expect(hold.continued).toBeUndefined()
  })

  it('пересчитывает строки второго блока под split первого', () => {
    const a = makeBlock([], 16, 4)
    const b = makeBlock([{ row: 4, col: 0, type: 'tap' }], 16, 8) // split 8 → фактор 0.5
    const next = mergeWithNext(makeChart([a, b]), a.id)!
    expect(next.blocks[0].rowCount).toBe(24) // 16 + 16*0.5
    expect(next.blocks[0].notes[0].row).toBe(18) // 16 + 4*0.5
  })

  it('последний блок — no-op', () => {
    const a = makeBlock([])
    expect(mergeWithNext(makeChart([a]), a.id)).toBeNull()
  })
})

describe('deleteBelow', () => {
  it('усечает блок и удаляет ноты ниже среза', () => {
    const b = makeBlock([
      { row: 2, col: 0, type: 'tap' },
      { row: 10, col: 1, type: 'tap' },
    ])
    const next = deleteBelow(makeChart([b]), b.id, 8)!
    expect(next.blocks[0].rowCount).toBe(8)
    expect(next.blocks[0].notes).toEqual([{ row: 2, col: 0, type: 'tap' }])
  })

  it('обрезает холд через срез, зависший continued соседа чистится', () => {
    const b1 = makeBlock([{ row: 4, col: 2, type: 'hold', endRow: 15, continues: true }])
    const b2 = makeBlock([{ row: 0, col: 2, type: 'hold', endRow: 3, continued: true }])
    const next = deleteBelow(makeChart([b1, b2]), b1.id, 8)!
    expect(next.blocks[0].notes[0]).toMatchObject({ row: 4, endRow: 7 })
    expect(next.blocks[0].notes[0].continues).toBeUndefined()
    expect(next.blocks[1].notes[0].continued).toBeUndefined()
  })
})
