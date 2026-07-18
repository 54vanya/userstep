import { describe, it, expect } from 'vitest'
import { beatDivision, rhythmColor } from '../rhythmColors'

describe('beatDivision', () => {
  it('ритмическая размерность = знаменатель несократимой доли бита', () => {
    expect(beatDivision(0, 4)).toBe(1) // на долю
    expect(beatDivision(2, 4)).toBe(2) // 8-я
    expect(beatDivision(1, 4)).toBe(4) // 16-я
    expect(beatDivision(1, 3)).toBe(3) // триоль
    expect(beatDivision(2, 6)).toBe(3)
    expect(beatDivision(1, 6)).toBe(6) // 24-я
    expect(beatDivision(3, 48)).toBe(16) // 64-я
    expect(beatDivision(1, 32)).toBe(32) // 128-я
    expect(beatDivision(1, 48)).toBe(48) // 192-я
  })

  it('битые split не роняют расчёт', () => {
    expect(beatDivision(5, 0)).toBe(0)
    expect(beatDivision(5, NaN)).toBe(0)
  })
})

describe('rhythmColor', () => {
  const GRAY = '#9aa3ad'

  it('стандартные доли имеют собственные цвета, включая 128-ю и 192-ю', () => {
    const distinct = new Set([1, 2, 3, 4, 6, 8, 12, 16, 32, 48].map(q => rhythmColor(1, q)))
    expect(distinct.size).toBe(10)
    expect(distinct.has(GRAY)).toBe(false)
  })

  it('гиммик CS241: нота на 1/32 бита (Split=32, row=1) — 128-я, не серая', () => {
    expect(rhythmColor(1, 32)).toBe('#a3d5f7')
  })

  it('нерегулярные доли — серый (96-я, 256-я, кастомные снапы)', () => {
    expect(rhythmColor(1, 24)).toBe(GRAY) // 96-я
    expect(rhythmColor(1, 64)).toBe(GRAY) // 256-я
    expect(rhythmColor(1, 5)).toBe(GRAY) // 20-я (кастомный снап)
  })
})
