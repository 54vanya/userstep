import { useChart } from '@/hooks/useChart'
import { useTabsStore } from '@/store/tabsStore'
import type { Block } from '@/types/chart'

export function Sidebar() {
  const { chart, addBlock, insertBlockAfter, duplicateBlock, deleteBlock, updateBlock } = useChart()
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
      <div className="px-3 py-2 border-b border-border space-y-1.5 text-xs">
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
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Blocks
      </div>
      <div className="flex-1 overflow-y-auto">
        {chart.blocks.map((block, i) => (
          <BlockEditor
            key={block.id}
            block={block}
            index={i}
            canDelete={chart.blocks.length > 1}
            onUpdate={patch => updateBlock(block.id, patch)}
            onInsertAfter={() => insertBlockAfter(block.id)}
            onDuplicate={() => duplicateBlock(block.id)}
            onDelete={() => deleteBlock(block.id)}
          />
        ))}
      </div>
      <div className="p-2 border-t border-border">
        <button
          onClick={addBlock}
          className="w-full py-1.5 rounded bg-secondary text-secondary-foreground text-xs hover:bg-accent transition-colors"
        >
          + Add Block
        </button>
      </div>
    </div>
  )
}

interface BlockEditorProps {
  block: Block
  index: number
  canDelete: boolean
  onUpdate: (patch: Partial<Block>) => void
  onInsertAfter: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function BlockEditor({ block, index, canDelete, onUpdate, onInsertAfter, onDuplicate, onDelete }: BlockEditorProps) {
  return (
    <div className="px-3 py-2 border-b border-border text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-foreground">Block {index + 1}</span>
        <div className="flex gap-1">
          <button
            onClick={onInsertAfter}
            title="Insert block after"
            className="text-muted-foreground hover:text-foreground transition-colors px-0.5"
          >
            +
          </button>
          <button
            onClick={onDuplicate}
            title="Duplicate block"
            className="text-muted-foreground hover:text-foreground transition-colors px-0.5"
          >
            ⧉
          </button>
          {canDelete && (
            <button
              onClick={onDelete}
              title="Delete block"
              className="text-muted-foreground hover:text-destructive transition-colors px-0.5"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <FieldRow label="BPM">
          <input
            type="number"
            min={1}
            max={999}
            value={block.bpm}
            onChange={e => onUpdate({ bpm: parseFloat(e.target.value) || 120 })}
            className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
          />
        </FieldRow>

        <FieldRow label="Beat">
          <select
            value={block.beat}
            onChange={e => onUpdate({ beat: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
          >
            {[2, 3, 4, 6, 8].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FieldRow>

        <FieldRow label="Split">
          <select
            value={block.split}
            onChange={e => onUpdate({ split: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
          >
            {[2, 3, 4, 6, 8, 12, 16].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FieldRow>

        <FieldRow label="Measures">
          <input
            type="number"
            min={1}
            max={256}
            value={block.measures}
            onChange={e => onUpdate({ measures: parseInt(e.target.value) || 1 })}
            className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
          />
        </FieldRow>

        <FieldRow label="Delay ms">
          <input
            type="number"
            min={0}
            value={block.delay}
            onChange={e => onUpdate({ delay: parseInt(e.target.value) || 0 })}
            className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
          />
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
