import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseUcs } from '../ucsParser'
import { serializeToUcs } from '../ucsSerializer'

const cs266 = readFileSync(resolve(__dirname, '../../../fileExamples/CS266.ucs'), 'utf-8')
const cs349 = readFileSync(resolve(__dirname, '../../../fileExamples/CS349.ucs'), 'utf-8')

describe('parseUcs', () => {
  it('parses CS266 (Double mode)', () => {
    const chart = parseUcs(cs266)
    expect(chart.chartType).toBe('Double')
    expect(chart.blocks.length).toBeGreaterThan(0)
    expect(chart.blocks[0].bpm).toBe(200)
    expect(chart.blocks[0].delay).toBe(100)
    expect(chart.blocks[0].beat).toBe(4)
    expect(chart.blocks[0].split).toBe(4)
  })

  it('parses CS349 (Single mode)', () => {
    const chart = parseUcs(cs349)
    expect(chart.chartType).toBe('Single')
    expect(chart.blocks.length).toBeGreaterThan(0)
    expect(chart.blocks[0].bpm).toBe(150)
    expect(chart.blocks[0].delay).toBe(20)
  })

  it('parses tap notes correctly', () => {
    const chart = parseUcs(cs266)
    const taps = chart.blocks.flatMap(b => b.notes).filter(n => n.type === 'tap')
    expect(taps.length).toBeGreaterThan(0)
  })

  it('parses hold notes correctly', () => {
    const chart = parseUcs(cs266)
    const holds = chart.blocks.flatMap(b => b.notes).filter(n => n.type === 'hold')
    expect(holds.length).toBeGreaterThan(0)
    for (const hold of holds) {
      expect(hold.endRow).toBeDefined()
      expect(hold.endRow!).toBeGreaterThan(hold.row)
    }
  })

  it('all holds have endRow > row', () => {
    for (const source of [cs266, cs349]) {
      const chart = parseUcs(source)
      for (const block of chart.blocks) {
        for (const note of block.notes) {
          if (note.type === 'hold') {
            expect(note.endRow).toBeDefined()
            expect(note.endRow!).toBeGreaterThanOrEqual(note.row)
          }
        }
      }
    }
  })

  it('measures calculated from rows count', () => {
    const chart = parseUcs(cs266)
    for (const block of chart.blocks) {
      expect(block.measures).toBeGreaterThan(0)
    }
  })
})

describe('serializeToUcs', () => {
  it('roundtrip preserves mode and block count', () => {
    const chart = parseUcs(cs266)
    const ucs = serializeToUcs(chart)
    const chart2 = parseUcs(ucs)
    expect(chart2.chartType).toBe(chart.chartType)
    expect(chart2.blocks.length).toBe(chart.blocks.length)
  })

  it('roundtrip preserves BPM values', () => {
    const chart = parseUcs(cs266)
    const ucs = serializeToUcs(chart)
    const chart2 = parseUcs(ucs)
    for (let i = 0; i < chart.blocks.length; i++) {
      expect(chart2.blocks[i].bpm).toBeCloseTo(chart.blocks[i].bpm, 1)
    }
  })

  it('roundtrip preserves note count', () => {
    const chart = parseUcs(cs266)
    const noteCount = chart.blocks.reduce((s, b) => s + b.notes.length, 0)
    const ucs = serializeToUcs(chart)
    const chart2 = parseUcs(ucs)
    const noteCount2 = chart2.blocks.reduce((s, b) => s + b.notes.length, 0)
    expect(noteCount2).toBe(noteCount)
  })

  it('output starts with :Format=1', () => {
    const chart = parseUcs(cs266)
    const ucs = serializeToUcs(chart)
    expect(ucs.startsWith(':Format=1')).toBe(true)
  })
})
