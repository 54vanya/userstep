// Платформенные подсказки сочетаний клавиш: обработчики принимают и Ctrl, и
// Cmd (e.ctrlKey || e.metaKey), а подписи на macOS показывают символы Apple.
// 'Ctrl+Shift+V' → '⇧⌘V' (порядок модификаторов ⌥⇧⌘, без «+»), на остальных
// платформах строка возвращается как есть.

export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)

const MAC_MOD: Record<string, string> = { Alt: '⌥', Shift: '⇧', Ctrl: '⌘' }
// Порядок модификаторов в подписи по конвенции Apple.
const MOD_ORDER = ['Alt', 'Shift', 'Ctrl']

// Преобразуется только комбо с Ctrl и «настоящей» клавишей в конце; строки вроде
// 'Shift+click' или 'hold key + ↓' возвращаются без изменений.
export function shortcutLabel(spec: string): string {
  if (!isMac || !spec.includes('+')) return spec
  const parts = spec.split('+')
  const key = parts.pop()!
  if (!key || !parts.includes('Ctrl') || !parts.every(p => MAC_MOD[p])) return spec
  const mods = MOD_ORDER.filter(m => parts.includes(m)).map(m => MAC_MOD[m])
  // Многобуквенные «не-клавиши» (wheel, click) отделяем пробелом: «⌘ wheel».
  const sep = /^[a-zа-я]{2,}/.test(key) ? ' ' : ''
  return mods.join('') + sep + key
}
