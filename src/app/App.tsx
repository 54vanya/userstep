import { TabBar } from '@/components/tabs/TabBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChartEditor } from '@/components/editor/ChartEditor'
import { FpsMeter } from '@/components/FpsMeter'
import { MenuBar } from '@/components/menu/MenuBar'
import { useEffect } from 'react'
import { useTabsStore } from '@/store/tabsStore'
import { useEditorStore } from '@/store/editorStore'
import { importUcsViaDialog, openPiuViaDialog, openDroppedFile } from '@/services/fileActions'
import { usePwaUpdate } from '@/hooks/usePwaUpdate'

export function App() {
  // Только факт наличия табов: подписка на весь стор ре-рендерила бы ВСЁ дерево
  // приложения из корня на каждый тик слайдера Scale / markDirty и т.п.
  const hasTabs = useTabsStore(s => s.tabs.length > 0)
  const { needRefresh, update } = usePwaUpdate()
  const showFps = useEditorStore(s => s.showFps)

  // Drag&drop файлов в окно: .ucs/.piu.json открываются новой вкладкой,
  // аудио грузится в активную.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      for (const file of e.dataTransfer?.files ?? []) openDroppedFile(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {showFps && <FpsMeter />}
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
      <div className="flex items-stretch shrink-0">
        <MenuBar />
        <TabBar />
      </div>
      {hasTabs ? (
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <ChartEditor />
        </div>
      ) : (
        <WelcomeScreen />
      )}
    </div>
  )
}

function WelcomeScreen() {
  const addTab = useTabsStore(s => s.addTab)

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
            onClick={importUcsViaDialog}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
          >
            Import .ucs
          </button>
          <button
            onClick={openPiuViaDialog}
            className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
          >
            Open .piu.json
          </button>
        </div>
      </div>
    </div>
  )
}
