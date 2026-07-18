import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Block, Chart, Note } from '@/types/chart'
import { serializeToSm } from '../smSerializer'
import { parseUcs } from '../ucsParser'

let seq = 0
function makeBlock(notes: Note[], over: Partial<Block> = {}): Block {
  return {
    id: `b${++seq}`,
    bpm: 120,
    delay: 0,
    beat: 4,
    split: 2,
    measures: 1,
    rowCount: 8, // 8 строк / split 2 = 4 бита = ровно один такт SM
    notes,
    ...over,
  }
}

function makeChart(blocks: Block[], over: Partial<Chart> = {}): Chart {
  return {
    id: 'c1',
    version: 1,
    meta: { title: 'Test Song', artist: 'Artist' },
    chartType: 'Single',
    difficulty: 12,
    blocks,
    ...over,
  }
}

// Тело секции #NOTES: такты (строки после шести заголовочных полей, до ';').
function noteMeasures(sm: string): string[][] {
  const body = sm.split('     0,0,0,0,0:\n')[1].split('\n;')[0]
  return body.split('\n,\n').map(m => m.split('\n'))
}

describe('serializeToSm', () => {
  it('заголовки: метаданные, тип чарта, difficulty как meter', () => {
    const sm = serializeToSm(makeChart([makeBlock([])]))
    expect(sm).toContain('#TITLE:Test Song;')
    expect(sm).toContain('#ARTIST:Artist;')
    expect(sm).toContain('#BPMS:0=120;')
    expect(sm).toContain('#OFFSET:0;')
    expect(sm).toContain('     pump-single:')
    expect(sm).toContain('     Edit:')
    expect(sm).toContain('     12:')
  })

  it('Double → pump-double, строки на 10 колонок', () => {
    const sm = serializeToSm(makeChart([makeBlock([{ row: 0, col: 7, type: 'tap' }])], { chartType: 'Double' }))
    expect(sm).toContain('     pump-double:')
    expect(noteMeasures(sm)[0][0]).toBe('0000000100')
  })

  it('tap на строке → 1; число строк такта по самой плотной ноте', () => {
    // split=2: строка 1 = 1/2 бита → 8 строк в такте; строки 0 и 1 — соседние.
    const sm = serializeToSm(makeChart([makeBlock([
      { row: 0, col: 0, type: 'tap' },
      { row: 1, col: 2, type: 'tap' },
    ])]))
    const m = noteMeasures(sm)[0]
    expect(m).toHaveLength(8)
    expect(m[0]).toBe('10000')
    expect(m[1]).toBe('00100')
  })

  it('такт без нот на дробных позициях сворачивается до 4 строк', () => {
    // Ноты только на целых битах (строки 0,2,4,6 при split=2) → 4 строки такта.
    const sm = serializeToSm(makeChart([makeBlock([
      { row: 0, col: 0, type: 'tap' },
      { row: 6, col: 4, type: 'tap' },
    ])]))
    const m = noteMeasures(sm)[0]
    expect(m).toHaveLength(4)
    expect(m[0]).toBe('10000')
    expect(m[3]).toBe('00001')
  })

  it('холд → 2 в голове, 3 в хвосте', () => {
    const sm = serializeToSm(makeChart([makeBlock([
      { row: 0, col: 1, type: 'hold', endRow: 4 },
    ])]))
    const m = noteMeasures(sm)[0]
    expect(m[0]).toBe('02000')
    expect(m[2]).toBe('03000') // строка 4 = бит 2 → строка такта 2 (из 4)
  })

  it('кросс-блочный холд → одна пара 2…3 через границу тактов', () => {
    const sm = serializeToSm(makeChart([
      makeBlock([{ row: 6, col: 2, type: 'hold', endRow: 7, continues: true }]),
      makeBlock([{ row: 0, col: 2, type: 'hold', endRow: 2, continued: true }]),
    ]))
    const [m1, m2] = noteMeasures(sm)
    expect(m1[3]).toBe('00200') // голова: строка 6 = бит 3
    expect(m1.join('')).not.toContain('3')
    expect(m2[1]).toBe('00300') // хвост: строка 2 второго блока = бит 1 (8 строк такта)
    expect(m2.join('')).not.toContain('2')
  })

  it('смена BPM и Delay между блоками → #BPMS и #DELAYS на бите границы', () => {
    const sm = serializeToSm(makeChart([
      makeBlock([]),
      makeBlock([], { bpm: 180, delay: 500 }),
    ]))
    expect(sm).toContain('#BPMS:0=120,4=180;')
    expect(sm).toContain('#DELAYS:4=0.5;')
  })

  it('Delay первого блока → отрицательный #OFFSET, не в #DELAYS', () => {
    const sm = serializeToSm(makeChart([makeBlock([], { delay: 730 })]))
    expect(sm).toContain('#OFFSET:-0.73;')
    expect(sm).toContain('#DELAYS:;')
  })

  it('дробные позиции через границу блоков с разным split точны', () => {
    // Блок split=3, 4 строки → 4/3 бита; следующий блок начинается на 4/3.
    const sm = serializeToSm(makeChart([
      makeBlock([], { split: 3, rowCount: 4 }),
      makeBlock([{ row: 0, col: 0, type: 'tap' }], { bpm: 150 }),
    ]))
    expect(sm).toContain('#BPMS:0=120,1.333333=150;')
    // Нота на бите 4/3: такт 0, позиция 4/3 бита → LCM(3) → 12 строк, строка 4.
    const m = noteMeasures(sm)[0]
    expect(m).toHaveLength(12)
    expect(m[4]).toBe('10000')
  })

  it('пустой чарт даёт минимум один пустой такт', () => {
    const sm = serializeToSm(makeChart([makeBlock([], { rowCount: 2 })]))
    const m = noteMeasures(sm)[0]
    expect(m).toEqual(['00000', '00000', '00000', '00000'])
  })

  it('спецсимволы в метаданных экранируются', () => {
    const sm = serializeToSm(makeChart([makeBlock([])], { meta: { title: 'A: B; C', artist: 'X' } }))
    expect(sm).toContain('#TITLE:A\\: B\\; C;')
  })

  it('смоук: реальные UCS (включая гиммик-чарт CS241, Split=128) сериализуются', () => {
    for (const name of ['CS241', 'CS266', 'CS349']) {
      const chart = parseUcs(readFileSync(resolve(__dirname, `../../../fileExamples/${name}.ucs`), 'utf-8'))
      const sm = serializeToSm(chart)
      expect(sm).toContain('#BPMS:')
      const measures = noteMeasures(sm)
      expect(measures.length).toBeGreaterThan(0)
      // Каждый такт — от 4 до 192 строк одинаковой ширины.
      for (const m of measures) {
        expect(m.length).toBeGreaterThanOrEqual(4)
        expect(m.length).toBeLessThanOrEqual(192)
        expect(m.every(line => line.length === m[0].length)).toBe(true)
      }
      // Баланс холдов: число голов равно числу хвостов.
      const flat = measures.flat().join('')
      expect((flat.match(/2/g) ?? []).length).toBe((flat.match(/3/g) ?? []).length)
    }
  })
})
