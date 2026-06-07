import type { Tab } from '@/types/chart'

const SESSION_KEY = 'piu-session'

type PersistedTab = Omit<Tab, 'audioBlob'>

interface PersistedSession {
  tabs: PersistedTab[]
  activeTabId: string | null
}

export function saveSession(tabs: Tab[], activeTabId: string | null): void {
  try {
    const data: PersistedSession = {
      tabs: tabs.map(({ audioBlob: _, ...rest }) => rest),
      activeTabId,
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
    return parsed
  } catch {
    return null
  }
}
