import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import {
  importUcsViaDialog,
  openPiuViaDialog,
  exportActiveUcs,
  saveActivePiu,
} from '@/services/fileActions'
import { ShortcutsModal } from './ShortcutsModal'
import { ChartInfoModal } from './ChartInfoModal'

const MenuCloseCtx = createContext<() => void>(() => {})

function MenuButton({
  label,
  id,
  open,
  setOpen,
  children,
}: {
  label: string
  id: string
  open: string | null
  setOpen: (id: string | null) => void
  children: ReactNode
}) {
  const isOpen = open === id
  return (
    <div className="relative">
      <button
        className={`px-3 h-full flex items-center transition-colors ${isOpen ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
        onClick={() => setOpen(isOpen ? null : id)}
        // Поведение нативного меню: когда одно открыто, наведение переключает на соседнее.
        onMouseEnter={() => { if (open !== null) setOpen(id) }}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full min-w-48 bg-card border border-border rounded-b-md shadow-lg py-1 z-50">
          <MenuCloseCtx.Provider value={() => setOpen(null)}>{children}</MenuCloseCtx.Provider>
        </div>
      )}
    </div>
  )
}

// Действие (закрывает меню после выбора).
function Item({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  const close = useContext(MenuCloseCtx)
  return (
    <button
      disabled={disabled}
      onClick={() => { onClick(); close() }}
      className="w-full text-left px-3 py-1 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

// Переключатель (меню остаётся открытым — удобно щёлкать несколько настроек).
function Toggle({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left px-3 py-1 hover:bg-accent flex items-center gap-2"
    >
      <span className="w-3 text-primary">{on ? '✓' : ''}</span>
      {children}
    </button>
  )
}

function Radio({ on, onSelect, children }: { on: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left px-3 py-1 hover:bg-accent flex items-center gap-2"
    >
      <span className="w-3 text-primary">{on ? '•' : ''}</span>
      {children}
    </button>
  )
}

function Separator() {
  return <div className="my-1 border-t border-border" />
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{children}</div>
}

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showChartInfo, setShowChartInfo] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const { tabs, activeTabId, addTab } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const {
    showColumnDividers, setShowColumnDividers,
    showRowLines, setShowRowLines,
    activeSkin, setActiveSkin,
    showFps, setShowFps,
    showNoteCounter, setShowNoteCounter,
    railColoring, setRailColoring,
    playbackMode, setPlaybackMode,
    playbackFpsCap, setPlaybackFpsCap,
    fieldAlign, setFieldAlign,
    theme, setTheme,
  } = useEditorStore()

  // Закрытие по клику вне меню / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={barRef} className="flex items-stretch h-9 border-b border-r border-border bg-card shrink-0 text-xs select-none">
      <MenuButton label="File" id="file" open={open} setOpen={setOpen}>
        <Item onClick={() => addTab()}>New chart</Item>
        <Separator />
        <Item onClick={importUcsViaDialog}>Import .ucs…</Item>
        <Item onClick={openPiuViaDialog}>Open .piu.json…</Item>
        <Separator />
        <Item onClick={exportActiveUcs} disabled={!activeTab}>Export .ucs</Item>
        <Item onClick={saveActivePiu} disabled={!activeTab}>Save .piu.json</Item>
        <Separator />
        <Item onClick={() => setShowChartInfo(true)} disabled={!activeTab || activeTab.isBlank}>Chart info…</Item>
        <Separator />
        <Item onClick={() => setShowShortcuts(true)}>Keyboard shortcuts…</Item>
      </MenuButton>

      <MenuButton label="View" id="view" open={open} setOpen={setOpen}>
        <Toggle on={showColumnDividers} onToggle={() => setShowColumnDividers(!showColumnDividers)}>Column lines</Toggle>
        <Toggle on={showRowLines} onToggle={() => setShowRowLines(!showRowLines)}>Row lines</Toggle>
        <Toggle on={showFps} onToggle={() => setShowFps(!showFps)}>Show FPS</Toggle>
        <Toggle on={showNoteCounter} onToggle={() => setShowNoteCounter(!showNoteCounter)}>Note counter overlay</Toggle>
        <Separator />
        <SectionLabel>Field alignment</SectionLabel>
        <Radio on={fieldAlign === 'left'} onSelect={() => setFieldAlign('left')}>Left</Radio>
        <Radio on={fieldAlign === 'center'} onSelect={() => setFieldAlign('center')}>Center</Radio>
        <Separator />
        <SectionLabel>Section colors</SectionLabel>
        <Radio on={railColoring === 'none'} onSelect={() => setRailColoring('none')}>None</Radio>
        <Radio on={railColoring === 'mono'} onSelect={() => setRailColoring('mono')}>Monochrome</Radio>
        <Radio on={railColoring === 'color'} onSelect={() => setRailColoring('color')}>Color</Radio>
        <Separator />
        <SectionLabel>Skin</SectionLabel>
        <Radio on={activeSkin === 'basic'} onSelect={() => setActiveSkin('basic')}>Basic</Radio>
        <Radio on={activeSkin === 'blocks'} onSelect={() => setActiveSkin('blocks')}>Blocks</Radio>
        <Separator />
        <SectionLabel>Playback</SectionLabel>
        <Radio on={playbackMode === 'snap'} onSelect={() => setPlaybackMode('snap')}>Pixel-snap (grid)</Radio>
        <Radio on={playbackMode === 'smooth'} onSelect={() => setPlaybackMode('smooth')}>Smooth</Radio>
        <Radio on={playbackMode === 'framelock'} onSelect={() => setPlaybackMode('framelock')}>Frame-lock</Radio>
        <Radio on={playbackMode === 'raw'} onSelect={() => setPlaybackMode('raw')}>Raw audio</Radio>
        <Toggle on={playbackFpsCap} onToggle={() => setPlaybackFpsCap(!playbackFpsCap)}>Limit to 60 FPS (video capture)</Toggle>
        <Separator />
        <SectionLabel>Theme</SectionLabel>
        <Radio on={theme === 'system'} onSelect={() => setTheme('system')}>System</Radio>
        <Radio on={theme === 'light'} onSelect={() => setTheme('light')}>Light</Radio>
        <Radio on={theme === 'dark'} onSelect={() => setTheme('dark')}>Dark</Radio>
      </MenuButton>
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showChartInfo && <ChartInfoModal onClose={() => setShowChartInfo(false)} />}
    </div>
  )
}
