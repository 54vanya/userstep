import { describe, it, expect } from 'vitest'
import type { Block, Note } from '@/types/chart'
import { placeHoldSpan, comparePos, sanitizeHoldFlags } from '../holds'

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

describe('comparePos', () => {
  it('сравнивает по блоку, затем по строке', () => {
    expect(comparePos({ blockIdx: 0, row: 5 }, { blockIdx: 1, row: 0 })).toBeLessThan(0)
    expect(comparePos({ blockIdx: 1, row: 0 }, { blockIdx: 1, row: 3 })).toBeLessThan(0)
    expect(comparePos({ blockIdx: 1, row: 3 }, { blockIdx: 1, row: 3 })).toBe(0)
  })
})

describe('placeHoldSpan', () => {
  it('нулевая длина — tap', () => {
    const blocks = [makeBlock([])]
    const res = placeHoldSpan(blocks, 2, { blockIdx: 0, row: 3 }, { blockIdx: 0, row: 3 })
    expect(res[0].notes).toEqual([{ row: 3, col: 2, type: 'tap' }])
  })

  it('внутри блока — обычный холд, существующие ноты в диапазоне расчищаются', () => {
    const blocks = [makeBlock([
      { row: 4, col: 2, type: 'tap' },
      { row: 5, col: 3, type: 'tap' }, // другая колонка — не трогаем
    ])]
    const res = placeHoldSpan(blocks, 2, { blockIdx: 0, row: 2 }, { blockIdx: 0, row: 6 })
    expect(res[0].notes).toEqual([
      { row: 5, col: 3, type: 'tap' },
      { row: 2, col: 2, type: 'hold', endRow: 6 },
    ])
  })

  it('через границу блоков — цепочка continues/continued', () => {
    const blocks = [makeBlock([]), makeBlock([]), makeBlock([])]
    const res = placeHoldSpan(blocks, 1, { blockIdx: 0, row: 14 }, { blockIdx: 2, row: 2 })
    expect(res[0].notes).toEqual([{ row: 14, col: 1, type: 'hold', endRow: 15, continues: true }])
    expect(res[1].notes).toEqual([{ row: 0, col: 1, type: 'hold', endRow: 15, continued: true, continues: true }])
    expect(res[2].notes).toEqual([{ row: 0, col: 1, type: 'hold', endRow: 2, continued: true }])
  })

  it('clearEnd стирает хвост прежнего, более длинного холда', () => {
    // Был холд b0[14] → b1[5]; укорачиваем до b0[15] — хвост в b1 должен исчезнуть.
    const long = placeHoldSpan([makeBlock([]), makeBlock([])], 1, { blockIdx: 0, row: 14 }, { blockIdx: 1, row: 5 })
    const res = sanitizeHoldFlags(
      placeHoldSpan(long, 1, { blockIdx: 0, row: 14 }, { blockIdx: 0, row: 15 }, { blockIdx: 1, row: 5 }),
    )
    expect(res[0].notes).toEqual([{ row: 14, col: 1, type: 'hold', endRow: 15 }])
    expect(res[1].notes).toEqual([])
  })

  it('clearStart стирает голову прежнего холда, ушедшего выше нового начала', () => {
    // Был холд b0[2] → b0[6] (конец = якорь 6, начало выше); укорачиваем снизу
    // до [4..6] — строки 2–3 прежнего холда должны расчиститься.
    const long = placeHoldSpan([makeBlock([])], 1, { blockIdx: 0, row: 2 }, { blockIdx: 0, row: 6 })
    const res = placeHoldSpan(
      long, 1, { blockIdx: 0, row: 4 }, { blockIdx: 0, row: 6 },
      { blockIdx: 0, row: 6 }, { blockIdx: 0, row: 2 },
    )
    expect(res[0].notes).toEqual([{ row: 4, col: 1, type: 'hold', endRow: 6 }])
  })

  it('clearStart через границу блоков — голова в предыдущем блоке исчезает', () => {
    // Был холд b0[14] → b1[5] (якорь b1[5], конец ушёл вверх в b0); возвращаемся
    // вниз до b1[3..5] — часть в b0 должна исчезнуть целиком.
    const long = placeHoldSpan([makeBlock([]), makeBlock([])], 1, { blockIdx: 0, row: 14 }, { blockIdx: 1, row: 5 })
    const res = sanitizeHoldFlags(
      placeHoldSpan(
        long, 1, { blockIdx: 1, row: 3 }, { blockIdx: 1, row: 5 },
        { blockIdx: 1, row: 5 }, { blockIdx: 0, row: 14 },
      ),
    )
    expect(res[0].notes).toEqual([])
    expect(res[1].notes).toEqual([{ row: 3, col: 1, type: 'hold', endRow: 5 }])
  })
})
