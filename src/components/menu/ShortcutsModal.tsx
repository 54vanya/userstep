import { useEffect, type ReactNode } from 'react'

// Модалка-справка по горячим клавишам (контент зеркалит docs/KEYBOARD.md).
// Вызывается из MenuBar: File → Keyboard shortcuts.

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-border bg-secondary text-secondary-foreground font-mono text-[11px] leading-none whitespace-nowrap">
      {children}
    </kbd>
  )
}

// «Ctrl+S» → <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd>; « / » разделяет альтернативы.
function Keys({ spec }: { spec: string }) {
  return (
    <span className="whitespace-nowrap">
      {spec.split(' / ').map((alt, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
          {alt.split('+').map((k, j) => (
            <span key={j}>
              {j > 0 && <span className="text-muted-foreground">+</span>}
              <Kbd>{k}</Kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  )
}

interface Section {
  title: string
  rows: [string, string][]
  note?: string
}

const SECTIONS: Section[] = [
  {
    title: 'Воспроизведение',
    rows: [
      ['Space', 'Play / pause'],
    ],
    note: 'Работает везде, кроме фокуса в текстовом поле. Rush 0.2×–4× — слайдер в тулбаре.',
  },
  {
    title: 'Файлы и вкладки',
    rows: [
      ['Ctrl+S', 'Сохранить .piu.json (с настройками редактора)'],
      ['Ctrl+N', 'Новая вкладка'],
      ['Ctrl+O', 'Импорт .ucs'],
      ['Ctrl+W', 'Закрыть вкладку (confirm при несохранённом)'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Следующая / предыдущая вкладка'],
    ],
    note: 'В браузерной вкладке Ctrl+N/W/Tab заняты браузером — полноценно работают в установленном PWA. Файлы можно просто перетаскивать в окно (.ucs, .piu.json, аудио).',
  },
  {
    title: 'Undo / redo',
    rows: [
      ['Ctrl+Z', 'Undo (глубина 50)'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
    ],
  },
  {
    title: 'Навигация',
    rows: [
      ['↑ / ↓', 'На строку (по сетке блока под курсором)'],
      ['PgUp / PgDn', 'На страницу'],
      ['Home / End', 'В начало / конец чарта'],
      ['Ctrl+колесо', 'Зум поля'],
    ],
    note: 'Во время воспроизведения навигация отключена.',
  },
  {
    title: 'Выделение',
    rows: [
      ['Shift+клик / Shift+drag', 'Выделить строку / диапазон строк (повторный Shift+клик расширяет)'],
      ['Ctrl+A', 'Выделить целиком блок под плейхедом'],
      ['Shift+клик по рельсе', 'Выделить блок целиком'],
      ['Esc', 'Снять выделение (обычный клик — тоже)'],
    ],
    note: 'Выделение не пересекает границы блоков: у блоков разный Split, поэтому диапазон живёт внутри одного блока.',
  },
  {
    title: 'Операции над выделением',
    rows: [
      ['Delete / Backspace', 'Удалить ноты в диапазоне; block-выделение — удалить блок'],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Копировать / вырезать / вставить (в начало выделения или от плейхеда)'],
      ['Ctrl+Shift+V', 'Вставить со сдвигом колонок (+1 за нажатие, с заворотом)'],
      ['X', 'Flip horizontal (зеркало по колонкам)'],
      ['Y', 'Flip vertical (реверс строк)'],
      ['M', 'Mirror (X + Y, поворот на 180°)'],
    ],
    note: 'Частично попавший в диапазон холд при удалении убирается целиком, при копировании — обрезается. Трансформации не трогают кросс-блочные холды.',
  },
  {
    title: 'Ввод нот',
    rows: [
      ['Клик', 'Поставить tap (по существующей ноте — удалить)'],
      ['Drag вниз', 'Растянуть hold (drag вверх — отмена)'],
      ['Alt+drag', 'Серия тапов по строкам под мышью'],
    ],
  },
  {
    title: 'Live-запись (во время воспроизведения)',
    rows: [
      ['Z Q S E C', 'Колонки ↙ ↖ ● ↗ ↘ (1P) — раскладка UCS Lite'],
      ['Num1 Num7 Num5 Num9 Num3', 'Колонки ↙ ↖ ● ↗ ↘ (2P, double) — именно цифровой блок'],
      ['1 2 3 4 5 6 7 8 9 0', 'Колонки 0–9 слева направо — раскладка StepMania'],
    ],
    note: 'Раскладка выбирается в View → Live input keys. Tap кладётся на ближайшую строку к текущему моменту (квантование по Split). Медленный Rush повышает точность.',
  },
]

interface Props {
  onClose: () => void
}

export function ShortcutsModal({ onClose }: Props) {
  // Esc закрывает модалку; capture + stopPropagation, чтобы глобальный Esc
  // (сброс выделения в ChartEditor) не сработал заодно.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      data-testid="shortcuts-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-[680px] max-w-[92vw] max-h-[85vh] flex flex-col text-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <span className="font-medium text-sm text-foreground">Горячие клавиши</span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                {section.title}
              </div>
              <table className="w-full">
                <tbody>
                  {section.rows.map(([keys, desc]) => (
                    <tr key={keys}>
                      <td className="py-0.5 pr-4 align-top w-56"><Keys spec={keys} /></td>
                      <td className="py-0.5 text-foreground">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {section.note && (
                <p className="mt-1 text-muted-foreground leading-snug">{section.note}</p>
              )}
            </div>
          ))}
          <p className="text-muted-foreground border-t border-border pt-2">
            <Kbd>Ctrl</Kbd> везде означает «Ctrl или Cmd» (на macOS работают обе).
            Ещё: метроном и хит-саунды — чекбоксы в тулбаре; resize блока — перетаскивание
            его нижней границы за рельсу; статус-бар под сеткой показывает позицию под мышью.
          </p>
        </div>
      </div>
    </div>
  )
}
