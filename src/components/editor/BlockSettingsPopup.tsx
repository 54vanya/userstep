import { useRef, useLayoutEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useChart } from '@/hooks/useChart'

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

  return (
    <div
      ref={popupRef}
      data-testid="block-settings-popup"
      className="fixed z-50 w-52 bg-card border border-border rounded-md shadow-xl text-xs overflow-hidden"
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
          <input
            type="number"
            min={1}
            max={999}
            value={block.bpm}
            onChange={e => updateBlock(blockId, { bpm: parseFloat(e.target.value) || 120 })}
            className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
          />
        </FieldRow>
        <FieldRow label="Beat">
          <select
            value={block.beat}
            onChange={e => updateBlock(blockId, { beat: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded px-1 py-0.5 text-foreground"
          >
            {[2, 3, 4, 6, 8].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Split">
          <select
            value={block.split}
            onChange={e => updateBlock(blockId, { split: parseInt(e.target.value) })}
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
            onChange={e => updateBlock(blockId, { measures: parseInt(e.target.value) || 1 })}
            className="w-full bg-input border border-border rounded px-1.5 py-0.5 text-foreground"
          />
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
      <div className="flex-1">{children}</div>
    </div>
  )
}
