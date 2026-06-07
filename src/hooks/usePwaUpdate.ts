import { useEffect, useRef, useState } from 'react'
import { Workbox } from 'workbox-window'

export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const wbRef = useRef<Workbox | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
    const wb = new Workbox('/sw.js')
    wbRef.current = wb
    wb.addEventListener('waiting', () => setNeedRefresh(true))
    wb.register()
    return () => { wbRef.current = null }
  }, [])

  const update = () => {
    const wb = wbRef.current
    if (!wb) return
    wb.addEventListener('controlling', () => window.location.reload())
    wb.messageSkipWaiting()
    setNeedRefresh(false)
  }

  return { needRefresh, update }
}
