import { create } from 'zustand'

interface EditorStore {
  scrollY: number
  isPlaying: boolean
  currentTime: number
  showColumnDividers: boolean
  activeSkin: string

  setScrollY: (y: number) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setShowColumnDividers: (show: boolean) => void
  setActiveSkin: (skin: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  scrollY: 0,
  isPlaying: false,
  currentTime: 0,
  showColumnDividers: false,
  activeSkin: 'basic',

  setScrollY: (scrollY) => set({ scrollY }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setShowColumnDividers: (showColumnDividers) => set({ showColumnDividers }),
  setActiveSkin: (activeSkin) => set({ activeSkin }),
}))
