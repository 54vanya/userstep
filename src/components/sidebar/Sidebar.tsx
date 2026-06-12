import { useChart } from '@/hooks/useChart'
import { useTabsStore } from '@/store/tabsStore'

export function Sidebar() {
  const { chart } = useChart()
  const { activeTabId, updateChartMeta } = useTabsStore()

  if (!chart) {
    return (
      <div className="w-56 border-r border-border bg-card flex items-center justify-center text-muted-foreground text-sm shrink-0">
        No chart open
      </div>
    )
  }

  return (
    <div className="w-56 border-r border-border bg-card flex flex-col shrink-0 overflow-hidden">
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Chart Info
      </div>
      <div className="px-3 py-2 space-y-1.5 text-xs">
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
