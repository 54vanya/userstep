import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { parseUcs } from '@/services/ucsParser'

interface Props {
  tabId: string
}

export function WelcomeScreen({ tabId }: Props) {
  const { importChartIntoTab, markBlank } = useTabsStore()
  const { setCurrentTime } = useEditorStore()

  const handleImportUcs = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ucs'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const chart = parseUcs(e.target?.result as string)
          const label = file.name.replace(/\.ucs$/i, '')
          chart.meta.title = label
          importChartIntoTab(tabId, chart, label)
        } catch {
          alert('Failed to parse UCS file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleImportPiu = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.piu.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const chart = JSON.parse(e.target?.result as string)
          const label = chart.meta?.title || file.name.replace(/\.piu\.json$|\.json$/i, '')
          const s = chart.editorSettings
          importChartIntoTab(tabId, chart, label, s)
          if (s) {
            audioEngine.setPlaybackRate(s.playbackRate)
            setCurrentTime(s.currentTime)
          }
        } catch {
          alert('Failed to parse .piu.json file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleCreateNew = () => {
    markBlank(tabId, false)
  }


  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">New chart</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose how to start</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={handleImportUcs}
            className="flex flex-col items-center gap-3 w-40 py-6 px-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-accent transition-colors text-center"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <div>
              <div className="text-sm font-medium">Import .ucs</div>
              <div className="text-xs text-muted-foreground mt-0.5">UCS chart file</div>
            </div>
          </button>

          <button
            onClick={handleImportPiu}
            className="flex flex-col items-center gap-3 w-40 py-6 px-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-accent transition-colors text-center"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <circle cx="12" cy="15" r="3"/>
            </svg>
            <div>
              <div className="text-sm font-medium">Open .piu.json</div>
              <div className="text-xs text-muted-foreground mt-0.5">Saved project</div>
            </div>
          </button>

          <button
            onClick={handleCreateNew}
            className="flex flex-col items-center gap-3 w-40 py-6 px-4 rounded-xl border border-border bg-card hover:bg-accent/50 hover:border-accent transition-colors text-center"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <div>
              <div className="text-sm font-medium">Create new</div>
              <div className="text-xs text-muted-foreground mt-0.5">Empty chart</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
