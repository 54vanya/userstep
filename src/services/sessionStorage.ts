import type { Tab } from '@/types/chart'
import { isValidChart } from '@/utils/chartGuard'

const SESSION_KEY = 'piu-session'

type PersistedTab = Omit<Tab, 'audioBlob'>

interface PersistedSession {
  tabs: PersistedTab[]
  activeTabId: string | null
  // Позиция воспроизведения по вкладкам (tabId → мс). Храним отдельной картой,
  // чтобы не мутировать chart.editorSettings (и не засорять undo-историю).
  times?: Record<string, number>
}

export function saveSession(
  tabs: Tab[],
  activeTabId: string | null,
  times?: Record<string, number>,
): void {
  try {
    const data: PersistedSession = {
      tabs: tabs.map(({ audioBlob: _, ...rest }) => rest),
      activeTabId,
      times,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(data))
  } catch { /* QuotaExceededError — ignore */ }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSession
    if (!Array.isArray(parsed?.tabs)) return null
    // Битый таб в сессии (например, сохранённый до валидации импорта) ронял бы
    // приложение при каждом запуске — отбрасываем только его, не всю сессию.
    // Rush клампится: сессия могла быть сохранена при старом диапазоне (до 4×).
    const tabs = parsed.tabs
      .filter(t => t && typeof t.id === 'string' && isValidChart(t.chart))
      .map(t => typeof t.playbackRate === 'number'
        ? { ...t, playbackRate: Math.min(2, Math.max(0.2, t.playbackRate)) }
        : t)
    const activeTabId = tabs.some(t => t.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0]?.id ?? null
    return { ...parsed, tabs, activeTabId }
  } catch {
    return null
  }
}
