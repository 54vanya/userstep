import { useRef, useLayoutEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useChart } from '@/hooks/useChart'
import { blockRowCount } from '@/utils/geometry'

const BEAT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16]
const SPLIT_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128]

// Гарантируем, что текущее значение блока есть в списке (импортированные чарты
// используют сплиты до 128 и нестандартные доли — иначе select их потеряет).
function withCurrent(opts: number[], cur: number): number[] {
  return opts.includes(cur) ? opts : [...opts, cur].sort((a, b) => a - b)
}

interface Props {
  blockId: string
  index: number
  top: number
  left: number
  editorTop: number
  editorBottom: number
  onClose: () => void
}

export function BlockSettingsPopup({ blockId, index, top, left, editorTop, editorBottom, onClose }: Props) {
  const { chart, updateBlock, insertBlockAfter, deleteBlock } = useChart()
  const block = chart?.blocks.find(b => b.id === blockId)
  const popupRef = useRef<HTMLDivElement>(null)
  const [clampedTop, setClampedTop] = useState(top)

  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el) return
    const h = el.offsetHeight
    const clamped = Math.max(editorTop, Math.min(top, editorBottom - h))
    setClampedTop(clamped)
  }, [top, editorTop, editorBottom, block?.bpm, block?.beat, block?.split])

  if (!block || !chart) return null
  const canDelete = chart.blocks.length > 1
  const setBpm = (v: number) => updateBlock(blockId, { bpm: Math.min(999, Math.max(1, v)) })

  return (
    <div
      ref={popupRef}
      data-testid="block-settings-popup"
      className="fixed z-50 w-60 bg-card border border-border rounded-md shadow-xl text-xs overflow-hidden"
      style={{ top: clampedTop, left }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="font-medium text-foreground">Block {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => insertBlockAfter(blockId)}
            title="Insert block after"
            className="text-muted-foreground hover:text-foreground transition-colors px-0.5"
          >
            +
          </button>
          {canDelete && (
            <button
              onClick={() => { deleteBlock(blockId); onClose() }}
              title="Delete block"
              className="text-muted-foreground hover:text-destructive transition-colors px-1 py-0.5"
            >
              <Trash2 size={11} />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close"
            className="text-muted-foreground hover:text-foreground transition-colors px-0.5 ml-1"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <FieldRow label="BPM">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0.001}
              max={9999}
              step="any"
              value={block.bpm}
              onChange={e => updateBlock(blockId, { bpm: parseFloat(e.target.value) || 120 })}
              className="flex-1 min-w-0 bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
            />
            <button
              onClick={() => setBpm(block.bpm * 2)}
              title="Multiply BPM by 2"
              className="shrink-0 px-1 py-0.5 rounded border border-border bg-secondary text-secondary-foreground hover:bg-accent transition-colors leading-none tabular-nums"
            >
              ×2
            </button>
            <button
              onClick={() => setBpm(block.bpm / 2)}
              title="Divide BPM by 2"
              className="shrink-0 px-1 py-0.5 rounded border border-border bg-secondary text-secondary-foreground hover:bg-accent transition-colors leading-none tabular-nums"
            >
              ÷2
            </button>
          </div>
        </FieldRow>
        <FieldRow label="Beat">
          <select
            value={block.beat}
            onChange={e => updateBlock(blockId, { beat: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
          >
            {withCurrent(BEAT_OPTIONS, block.beat).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Split">
          <select
            value={block.split}
            onChange={e => updateBlock(blockId, { split: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
          >
            {withCurrent(SPLIT_OPTIONS, block.split).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Measures">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={block.measures}
              onChange={e => updateBlock(blockId, { measures: parseFloat(e.target.value) || 0 })}
              className="flex-1 min-w-0 bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
            />
            <span className="text-muted-foreground shrink-0 tabular-nums text-[10px] whitespace-nowrap" title="Rows in block">
              {blockRowCount(block)} rows
            </span>
          </div>
        </FieldRow>
        <FieldRow label="Delay ms">
          <input
            type="number"
            min={0}
            value={block.delay}
            onChange={e => updateBlock(blockId, { delay: parseInt(e.target.value) || 0 })}
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
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
