import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { loadTheme, applyTheme } from './utils/theme'
import { openDroppedFile } from './services/fileActions'

applyTheme(loadTheme())

// PWA file_handlers: файлы, открытые через ОС («Открыть с помощью…» /
// drag&drop на иконку установленного приложения).
interface LaunchParams { files?: { getFile(): Promise<File> }[] }
interface LaunchQueue { setConsumer(cb: (params: LaunchParams) => void): void }
const launchQueue = (window as { launchQueue?: LaunchQueue }).launchQueue
launchQueue?.setConsumer(async params => {
  for (const handle of params.files ?? []) {
    openDroppedFile(await handle.getFile())
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
