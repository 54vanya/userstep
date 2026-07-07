// Поле ввода текста (где пробел/горячие клавиши должны работать как обычно), в
// отличие от управляющих контролов вроде range/checkbox/button — на них пробел
// обязан доставаться play/pause (см. инвариант тулбара в ChartEditor.onKeyDown).
const TEXT_INPUT_TYPES = ['text', 'number', 'search', 'email', 'url', 'tel', 'password']

export function isTextEntry(el: HTMLElement): boolean {
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return TEXT_INPUT_TYPES.includes((el as HTMLInputElement).type)
  return false
}
