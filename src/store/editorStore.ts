import { create } from 'zustand'

interface EditorStore {
  scrollY: number
  isPlaying: boolean
  currentTime: number
  showColumnDividers: boolean

  setScrollY: (y: number) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setShowColumnDividers: (show: boolean) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  scrollY: 0,
  isPlaying: false,
  currentTime: 0,
  showColumnDividers: false,

  setScrollY: (scrollY) => set({ scrollY }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setShowColumnDividers: (showColumnDividers) => set({ showColumnDividers }),
}))
