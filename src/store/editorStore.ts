import { create } from 'zustand'
import { loadTheme, applyTheme, type Theme } from '@/utils/theme'

interface EditorStore {
  isPlaying: boolean
  currentTime: number
  showColumnDividers: boolean
  activeSkin: string
  showFps: boolean
  theme: Theme

  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setShowColumnDividers: (show: boolean) => void
  setActiveSkin: (skin: string) => void
  setShowFps: (show: boolean) => void
  setTheme: (theme: Theme) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  isPlaying: false,
  currentTime: 0,
  showColumnDividers: false,
  activeSkin: 'basic',
  showFps: false,
  theme: loadTheme(),

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setShowColumnDividers: (showColumnDividers) => set({ showColumnDividers }),
  setActiveSkin: (activeSkin) => set({ activeSkin }),
  setShowFps: (showFps) => set({ showFps }),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
}))
