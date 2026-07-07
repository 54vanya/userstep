import { useEffect } from 'react'
import { useChart } from '@/hooks/useChart'
import { useTabsStore } from '@/store/tabsStore'

// Модалка метаданных чарта (Title/Artist/Level/Mode) — бывшая секция Chart Info
// сайдбара. Вызывается из MenuBar: File → Chart info.

interface Props {
  onClose: () => void
}

export function ChartInfoModal({ onClose }: Props) {
  const { chart } = useChart()
  const { activeTabId, updateChartMeta } = useTabsStore()

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

  if (!chart) return null

  return (
    <div
      data-testid="chart-info-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-[360px] max-w-[92vw] flex flex-col text-xs"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <span className="font-medium text-sm text-foreground">Chart info</span>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="text-muted-foreground hover:text-foreground transition-colors px-1"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3 space-y-2">
          <FieldRow label="Title">
            <input
              type="text"
              value={chart.meta.title}
              onChange={e => activeTabId && updateChartMeta(activeTabId, { meta: { title: e.target.value } })}
              className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
            />
          </FieldRow>
          <FieldRow label="Artist">
            <input
              type="text"
              value={chart.meta.artist}
              onChange={e => activeTabId && updateChartMeta(activeTabId, { meta: { artist: e.target.value } })}
              className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
            />
          </FieldRow>
          <FieldRow label="Level">
            <input
              type="number"
              min={1}
              max={29}
              value={chart.difficulty}
              onChange={e => activeTabId && updateChartMeta(activeTabId, { difficulty: parseInt(e.target.value) || 1 })}
              className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
            />
          </FieldRow>
          <FieldRow label="Mode">
            <select
              value={chart.chartType}
              onChange={e => activeTabId && updateChartMeta(activeTabId, { chartType: e.target.value as 'Single' | 'Double' })}
              className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
            >
              <option value="Single">Single</option>
              <option value="Double">Double</option>
            </select>
          </FieldRow>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
