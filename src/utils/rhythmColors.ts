// Ритм-окраска нот в стиле StepMania/ITG: цвет ноты определяется её положением
// внутри доли (beat). split = число строк на долю, поэтому позиция ноты внутри
// доли = row mod split. Дробь (row mod split)/split сокращаем до несократимой —
// знаменатель q задаёт «какая это нота» (её ритмическую размерность) и цвет:
//   q=1  → 4-я (на долю)      — красный
//   q=2  → 8-я (1/2 доли)     — синий
//   q=3  → 12-я (триоль)      — фиолетовый
//   q=4  → 16-я (1/4 доли)    — жёлтый
//   q=6  → 24-я               — розовый/маджента
//   q=8  → 32-я               — оранжевый
//   q=12 → 48-я               — голубой
//   q=16 → 64-я               — зелёный
//   иное → нерегулярные/192-е — серый
export const RHYTHM_YELLOW = '#ffe000' // 16-я: насыщенный жёлтый (под color-блендингом важны тон/насыщенность)

const RHYTHM_COLORS: Record<number, string> = {
  1: '#e6232f',
  2: '#3a6df0',
  3: '#9b3fe0',
  4: RHYTHM_YELLOW,
  6: '#e23fb0',
  8: '#e8862a',
  12: '#2ec7e0',
  16: '#4fd934',
}
const RHYTHM_FALLBACK = '#9aa3ad'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

// Знаменатель beat-дроби в несократимом виде = ритмическая размерность ноты (q).
// q=1 — на долю (4-я), q=2 — 8-я, q=4 — 16-я и т.д. См. таблицу выше.
export function beatDivision(row: number, split: number): number {
  if (!Number.isFinite(split) || split <= 0) return 0
  const r = ((row % split) + split) % split
  return split / gcd(r, split)
}

export function rhythmColor(row: number, split: number): string {
  return RHYTHM_COLORS[beatDivision(row, split)] ?? RHYTHM_FALLBACK
}
