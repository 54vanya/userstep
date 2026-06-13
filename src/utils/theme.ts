export type Theme = 'system' | 'light' | 'dark'

const KEY = 'piu-theme'

export function loadTheme(): Theme {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}

// 'system' → без класса (решает @media prefers-color-scheme); иначе явный класс
// .light/.dark на <html> перебивает медиа-запрос (выше по специфичности).
export function applyTheme(theme: Theme): void {
  const el = document.documentElement
  el.classList.remove('light', 'dark')
  if (theme !== 'system') el.classList.add(theme)
  localStorage.setItem(KEY, theme)
}
