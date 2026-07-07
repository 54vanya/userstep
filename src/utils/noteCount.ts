import type { Block } from '@/types/chart'
import { computeBlockOffsets } from './timing'
import { noteEnd } from './holds'

// Отсортированные времена всех «хитов». Хит — строка (момент времени), где есть
// хотя бы одна активная ячейка: tap, голова/тело/хвост холда (холд даёт хит на
// КАЖДУЮ занятую строку). Ноты в одной строке (разные колонки) = один хит.
export function computeHitTimes(blocks: Block[]): number[] {
  const offsets = computeBlockOffsets(blocks)
  const times: number[] = []
  blocks.forEach((b, i) => {
    const off = offsets[i]
    if (!off) return
    const rows = new Set<number>()
    for (const n of b.notes) {
      const end = noteEnd(n)
      for (let r = n.row; r <= end; r++) rows.add(r)
    }
    rows.forEach(r => times.push(off.startMs + r * off.msPerRow))
  })
  times.sort((a, b) => a - b)
  return times
}

// Число хитов, пройденных к позиции ms (hitTimes отсортирован). Допуск ~1мс:
// нота ровно на курсоре считается пройденной.
export function countPassed(hitTimes: number[], ms: number): number {
  let lo = 0
  let hi = hitTimes.length
  const t = ms + 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (hitTimes[mid] <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}
