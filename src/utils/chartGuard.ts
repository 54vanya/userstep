import type { Chart } from '@/types/chart'

// Минимальная проверка формы Chart для данных из внешних источников (.piu.json,
// восстановленная сессия): произвольный валидный JSON не должен доезжать до
// рендера — иначе битый таб сохраняется в сессию и роняет приложение при
// каждом запуске (crash loop до ручной очистки localStorage).
export function isValidChart(c: unknown): c is Chart {
  if (typeof c !== 'object' || c === null) return false
  const chart = c as Chart
  if (typeof chart.meta !== 'object' || chart.meta === null) return false
  if (!Array.isArray(chart.blocks) || chart.blocks.length === 0) return false
  return chart.blocks.every(b =>
    typeof b === 'object' && b !== null &&
    Number.isFinite(b.bpm) && b.bpm > 0 &&
    Number.isFinite(b.beat) && b.beat > 0 &&
    Number.isFinite(b.split) && b.split > 0 &&
    Number.isFinite(b.delay) &&
    Number.isFinite(b.rowCount ?? b.measures) &&
    Array.isArray(b.notes)
  )
}
