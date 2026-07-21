import { useEffect, type ReactNode } from 'react'
import { isMac, shortcutLabel } from '@/utils/shortcuts'

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
// На macOS Ctrl-комбо сворачивается в один чип с символами Apple: <Kbd>⇧⌘V</Kbd>.
function Keys({ spec }: { spec: string }) {
  return (
    <span className="whitespace-nowrap">
      {spec.split(' / ').map((alt, i) => {
        const mac = shortcutLabel(alt)
        return (
          <span key={i}>
            {i > 0 && <span className="text-muted-foreground mx-1">/</span>}
            {mac !== alt ? (
              <Kbd>{mac}</Kbd>
            ) : (
              alt.split('+').map((k, j) => (
                <span key={j}>
                  {j > 0 && <span className="text-muted-foreground">+</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))
            )}
          </span>
        )
      })}
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
    title: 'Playback',
    rows: [
      ['Space', 'Play / pause'],
    ],
    note: 'Works everywhere except when a text field is focused. Rush 0.2×–2× — slider in the left sidebar.',
  },
  {
    title: 'Files & tabs',
    rows: [
      ['Ctrl+S', 'Save .piu.json (with editor settings)'],
      ['Ctrl+N', 'New tab'],
      ['Ctrl+O', 'Import .ucs'],
      ['Ctrl+W', 'Close tab (confirms if unsaved)'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous tab'],
    ],
    note: `In a browser tab ${isMac ? '⌘N/W and Ctrl+Tab' : 'Ctrl+N/W/Tab'} are reserved by the browser — they fully work in the installed PWA. Files can simply be dropped onto the window (.ucs, .piu.json, audio).`,
  },
  {
    title: 'Undo / redo',
    rows: [
      ['Ctrl+Z', 'Undo (50 steps)'],
      ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
    ],
  },
  {
    title: 'Navigation',
    rows: [
      ['↑ / ↓', 'One row (grid of the block under the cursor)'],
      ['PgUp / PgDn', 'One page'],
      ['Home / End', 'Start / end of the chart'],
      ['Ctrl+wheel', 'Scale (row spacing)'],
    ],
    note: 'Navigation is disabled during playback.',
  },
  {
    title: 'Selection',
    rows: [
      ['Shift+click / Shift+drag', 'Select a row / row range (another Shift+click extends it)'],
      ['Ctrl+A', 'Select the whole block under the playhead'],
      ['Shift+click on rail', 'Select the whole block'],
      ['Esc', 'Clear selection (a plain click does too)'],
    ],
    note: 'Selection does not cross block boundaries: blocks have different Split, so a range lives within one block.',
  },
  {
    title: 'Selection operations',
    rows: [
      ['Delete / Backspace', 'Delete notes in the range; block selection — delete the block'],
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy / cut / paste (at selection start if any, else at the playhead; copy/cut clear the selection)'],
      ['Ctrl+Shift+V', 'Paste with column shift (+1 per press, wraps around)'],
      ['X', 'Flip horizontal (mirror left/right)'],
      ['Y', 'Flip vertical (mirror up/down)'],
      ['M', 'Mirror (180° rotation)'],
    ],
    note: 'A hold partially inside the range is deleted whole and trimmed when copied. Transforms do not touch cross-block holds.',
  },
  {
    title: 'Note input',
    rows: [
      ['Click', 'Place a tap (click an existing note to delete it)'],
      ['Drag down', 'Stretch a hold (drag up to cancel)'],
      ['Alt+drag', 'Series of taps along the rows under the mouse'],
    ],
  },
  {
    title: 'Key note input (works anytime)',
    rows: [
      ['Z Q S E C', 'Columns ↙ ↖ ● ↗ ↘ (1P) — UCS Lite layout'],
      ['Num1 Num7 Num5 Num9 Num3', 'Columns ↙ ↖ ● ↗ ↘ (2P, double) — numeric keypad only'],
      ['1 2 3 4 5 6 7 8 9 0', 'Columns 0–9 left to right — StepMania layout'],
      ['hold key + ↓ / ↑', 'Stretch a hold from the placed note, down or up (while paused)'],
    ],
    note: 'Both layouts are always active. During playback (live recording) a tap lands on the row closest to the current moment (quantized to Split; slower Rush improves accuracy). When paused, the key acts like a click on the row under the cursor — an empty cell gets a tap, an occupied one is cleared; keep the key held and press ↓/↑ to grow a hold.',
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
          <span className="font-medium text-sm text-foreground">Keyboard shortcuts</span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            ✕
          </button>
        </div>
        {/* min-h-0: flex-ребёнок иначе не сжимается под max-h родителя и
            overflow-y-auto никогда не включается — контент вылезал за модалку.
            modal-scroll — постоянно видимый скроллбар (index.css). */}
        <div className="modal-scroll flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
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
            <Kbd>Ctrl</Kbd> always means “Ctrl or Cmd” (both work on macOS).
            Also: metronome and hit sounds are sidebar checkboxes; resize a block by
            dragging its bottom edge on the rail; the status bar below the grid shows
            the position under the mouse.
          </p>
        </div>
      </div>
    </div>
  )
}
