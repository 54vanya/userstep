import { TabBar } from '@/components/tabs/TabBar'
import { Toolbar } from '@/components/toolbar/Toolbar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChartEditor } from '@/components/editor/ChartEditor'
import { useTabsStore } from '@/store/tabsStore'
import { parseUcs } from '@/services/ucsParser'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'

export function App() {
  const { tabs } = useTabsStore()
  const { needRefresh, update } = usePwaUpdate()

  return (
    <div className="flex flex-col h-full">
      {needRefresh && (
        <div className="flex items-center justify-between px-4 py-2 bg-primary text-primary-foreground text-sm shrink-0">
          <span>New version available</span>
          <button
            onClick={update}
            className="ml-4 px-3 py-0.5 rounded bg-primary-foreground text-primary text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Update
          </button>
        </div>
      )}
      <TabBar />
      {tabs.length > 0 ? (
        <>
          <Toolbar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <ChartEditor />
          </div>
        </>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  )
}

function WelcomeScreen() {
  const { addTab } = useTabsStore()

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
          chart.meta.title = file.name.replace(/\.ucs$/i, '')
          addTab(chart, chart.meta.title)
        } catch {
          alert('Failed to parse UCS file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleLoadPiu = () => {
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
          addTab(chart, chart.meta?.title || file.name.replace(/\.piu\.json$|\.json$/, ''))
        } catch {
          alert('Failed to parse .piu.json file')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-medium text-foreground">PIU StepMaker</h1>
        <p className="text-muted-foreground text-sm">Pump It Up chart editor</p>
        <div className="flex gap-3 justify-center mt-6">
          <button
            onClick={() => addTab()}
            className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity"
          >
            New Chart
          </button>
          <button
            onClick={handleImportUcs}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
          >
            Import .ucs
          </button>
          <button
            onClick={handleLoadPiu}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
          >
            Open .piu.json
          </button>
        </div>
      </div>
    </div>
  )
}
