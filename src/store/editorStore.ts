import { create } from 'zustand'
import { loadTheme, applyTheme, type Theme } from '@/utils/theme'
import { loadViewSettings, saveViewSettings, type PlaybackMode } from '@/utils/viewSettings'

interface EditorStore {
  isPlaying: boolean
  currentTime: number
  showColumnDividers: boolean
  showRowLines: boolean
  activeSkin: string
  showFps: boolean
  playbackMode: PlaybackMode
  theme: Theme

  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setShowColumnDividers: (show: boolean) => void
  setShowRowLines: (show: boolean) => void
  setActiveSkin: (skin: string) => void
  setShowFps: (show: boolean) => void
  setPlaybackMode: (mode: PlaybackMode) => void
  setTheme: (theme: Theme) => void
}

const _view = loadViewSettings()

export const useEditorStore = create<EditorStore>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  showColumnDividers: _view.showColumnDividers,
  showRowLines: _view.showRowLines,
  activeSkin: _view.activeSkin,
  showFps: _view.showFps,
  playbackMode: _view.playbackMode,
  theme: loadTheme(),

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setShowColumnDividers: (showColumnDividers) => { set({ showColumnDividers }); persistView(get) },
  setShowRowLines: (showRowLines) => { set({ showRowLines }); persistView(get) },
  setActiveSkin: (activeSkin) => { set({ activeSkin }); persistView(get) },
  setShowFps: (showFps) => { set({ showFps }); persistView(get) },
  setPlaybackMode: (playbackMode) => { set({ playbackMode }); persistView(get) },
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
}))

function persistView(get: () => EditorStore): void {
  const { showColumnDividers, showRowLines, activeSkin, showFps, playbackMode } = get()
  saveViewSettings({ showColumnDividers, showRowLines, activeSkin, showFps, playbackMode })
}
