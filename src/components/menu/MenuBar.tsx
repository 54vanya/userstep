import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { audioEngine } from '@/services/audioEngine'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { parseUcs } from '@/services/ucsParser'
import { serializeToUcs } from '@/services/ucsSerializer'

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function pickFile(accept: string, onPick: (file: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) onPick(file)
  }
  input.click()
}

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
  const barRef = useRef<HTMLDivElement>(null)

  const { tabs, activeTabId, addTab, setTabScale, setTabPlaybackRate } = useTabsStore()
  const activeTab = tabs.find(t => t.id === activeTabId)
  const {
    currentTime, setCurrentTime,
    showColumnDividers, setShowColumnDividers,
    activeSkin, setActiveSkin,
    showFps, setShowFps,
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

  const handleImportUcs = () => pickFile('.ucs', file => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const chart = parseUcs(e.target?.result as string)
        const label = file.name.replace(/\.ucs$/i, '')
        chart.meta.title = label
        addTab(chart, label)
      } catch {
        alert('Failed to parse UCS file')
      }
    }
    reader.readAsText(file)
  })

  const handleLoadPiu = () => pickFile('.json,.piu.json', file => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const chart = JSON.parse(e.target?.result as string)
        const label = chart.meta?.title || file.name.replace(/\.piu\.json$|\.json$/, '')
        const tabId = addTab(chart, label)
        if (chart.editorSettings) {
          setTabScale(tabId, chart.editorSettings.scale)
          setTabPlaybackRate(tabId, chart.editorSettings.playbackRate)
          audioEngine.setPlaybackRate(chart.editorSettings.playbackRate)
          setCurrentTime(chart.editorSettings.currentTime)
        }
      } catch {
        alert('Failed to parse .piu.json file')
      }
    }
    reader.readAsText(file)
  })

  const handleExportUcs = () => {
    if (!activeTab) return
    downloadFile(`${activeTab.label}.ucs`, serializeToUcs(activeTab.chart), 'text/plain')
  }

  const handleSavePiu = () => {
    if (!activeTab) return
    const chartWithSettings = {
      ...activeTab.chart,
      editorSettings: { scale: activeTab.scale, playbackRate: activeTab.playbackRate, currentTime },
    }
    downloadFile(`${activeTab.label}.piu.json`, JSON.stringify(chartWithSettings, null, 2), 'application/json')
  }

  return (
    <div ref={barRef} className="flex items-stretch h-9 border-b border-r border-border bg-card shrink-0 text-xs select-none">
      <MenuButton label="File" id="file" open={open} setOpen={setOpen}>
        <Item onClick={() => addTab()}>New chart</Item>
        <Separator />
        <Item onClick={handleImportUcs}>Import .ucs…</Item>
        <Item onClick={handleLoadPiu}>Open .piu.json…</Item>
        <Separator />
        <Item onClick={handleExportUcs} disabled={!activeTab}>Export .ucs</Item>
        <Item onClick={handleSavePiu} disabled={!activeTab}>Save .piu.json</Item>
      </MenuButton>

      <MenuButton label="View" id="view" open={open} setOpen={setOpen}>
        <Toggle on={showColumnDividers} onToggle={() => setShowColumnDividers(!showColumnDividers)}>Column lines</Toggle>
        <Toggle on={showFps} onToggle={() => setShowFps(!showFps)}>Show FPS</Toggle>
        <Separator />
        <SectionLabel>Skin</SectionLabel>
        <Radio on={activeSkin === 'basic'} onSelect={() => setActiveSkin('basic')}>Basic</Radio>
        <Radio on={activeSkin === 'blocks'} onSelect={() => setActiveSkin('blocks')}>Blocks</Radio>
        <Separator />
        <SectionLabel>Theme</SectionLabel>
        <Radio on={theme === 'system'} onSelect={() => setTheme('system')}>System</Radio>
        <Radio on={theme === 'light'} onSelect={() => setTheme('light')}>Light</Radio>
        <Radio on={theme === 'dark'} onSelect={() => setTheme('dark')}>Dark</Radio>
      </MenuButton>
    </div>
  )
}
