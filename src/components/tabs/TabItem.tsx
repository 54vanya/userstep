import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tab } from '@/types/chart'

interface TabItemProps {
  tab: Tab
  isActive: boolean
  onActivate: () => void
  onClose: () => void
}

export function TabItem({ tab, isActive, onActivate, onClose }: TabItemProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (tab.isDirty) {
      if (!confirm(`Close "${tab.label}"? Unsaved changes will be lost.`)) return
    }
    onClose()
  }

  return (
    <button
      onClick={onActivate}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-sm border-r border-border select-none shrink-0 max-w-40',
        'hover:bg-accent/50 transition-colors',
        isActive ? 'bg-accent text-foreground' : 'text-muted-foreground'
      )}
    >
      <span className="truncate">{tab.label}</span>
      {tab.isDirty && <span className="text-primary shrink-0">●</span>}
      <span
        role="button"
        tabIndex={0}
        onClick={handleClose}
        onKeyDown={e => e.key === 'Enter' && handleClose(e as unknown as React.MouseEvent)}
        className="shrink-0 rounded hover:bg-muted p-0.5 cursor-pointer"
      >
        <X size={12} />
      </span>
    </button>
  )
}
