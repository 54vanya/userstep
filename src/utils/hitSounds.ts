import type { Block } from '@/types/chart'
import { computeBlockOffsets } from './timing'
import { beatDivision } from './rhythmColors'

export interface HitSoundEvent {
  ms: number
  q: number
}

// События «прилёта стрелки к курсору»: по одному на строку, где есть голова ноты
// (tap или начало холда). Тело/хвост холда не озвучиваем — это не отдельные стрелки.
// continued-холды (продолжение из прошлого блока) пропускаем: их голова уже
// озвучена в предыдущем блоке. q — ритмическая размерность строки (для частоты бипа).
export function computeHitSounds(blocks: Block[]): HitSoundEvent[] {
  const offsets = computeBlockOffsets(blocks)
  const events: HitSoundEvent[] = []
  blocks.forEach((b, i) => {
    const off = offsets[i]
    if (!off) return
    const rows = new Set<number>()
    for (const n of b.notes) {
      if (n.continued) continue
      rows.add(n.row)
    }
    rows.forEach(r => events.push({ ms: off.startMs + r * off.msPerRow, q: beatDivision(r, b.split) }))
  })
  events.sort((a, b) => a.ms - b.ms)
  return events
}

// Частота бипа по ритмической размерности ноты: чем мельче деление — тем выше тон,
// так на слух различимы 4-е/8-е/16-е и т.д. Неизвестное деление → нейтральный тон.
const HIT_FREQ: Record<number, number> = {
  1: 880,   // 4-я
  2: 1175,  // 8-я
  3: 1319,  // 12-я
  4: 1568,  // 16-я
  6: 1760,  // 24-я
  8: 2093,  // 32-я
  12: 2349, // 48-я
  16: 2637, // 64-я
}

export function hitSoundFreq(q: number): number {
  return HIT_FREQ[q] ?? 988
}
