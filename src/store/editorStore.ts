import { create } from 'zustand'

interface EditorStore {
  scale: number
  scrollY: number
  isPlaying: boolean
  currentTime: number
  playbackRate: number

  setScale: (scale: number) => void
  setScrollY: (y: number) => void
  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setPlaybackRate: (rate: number) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  scale: 3,
  scrollY: 0,
  isPlaying: false,
  currentTime: 0,
  playbackRate: 1.0,

  setScale: (scale) => set({ scale: Math.min(10, Math.max(1, scale)) }),
  setScrollY: (scrollY) => set({ scrollY }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setPlaybackRate: (rate) => {
    const clamped = Math.round(Math.min(1.5, Math.max(0.5, rate)) * 10) / 10
    set({ playbackRate: clamped })
  },
}))
