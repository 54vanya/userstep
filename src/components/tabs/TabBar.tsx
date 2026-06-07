import { Plus } from 'lucide-react'
import { useTabsStore } from '@/store/tabsStore'
import { TabItem } from './TabItem'

export function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabsStore()

  return (
    <div className="flex items-stretch border-b border-border bg-card h-9 overflow-x-auto shrink-0">
      {tabs.map(tab => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => setActiveTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}
      <button
        onClick={() => addTab()}
        className="flex items-center px-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
        title="New chart"
      >
        <Plus size={16} />
      </button>
    </div>
  )
}
