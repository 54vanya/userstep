import { create } from 'zustand'
import { loadTheme, applyTheme, type Theme } from '@/utils/theme'
import { loadViewSettings, saveViewSettings, clampFieldZoom, type PlaybackMode, type RailColoring, type LiveKeyLayout } from '@/utils/viewSettings'

// Выделение (модель StepEdit Lite, два уровня):
// rows  — диапазон строк ОДНОГО блока, все колонки; операции фазы 3 (delete/copy/
//         flip) работают по нему;
// block — блок целиком (Shift+клик по рельсе), Delete удаляет сам блок.
export type Selection =
  | { kind: 'rows'; blockId: string; fromRow: number; toRow: number }
  | { kind: 'block'; blockId: string }

interface EditorStore {
  isPlaying: boolean
  currentTime: number
  selection: Selection | null
  showColumnDividers: boolean
  showRowLines: boolean
  activeSkin: string
  showFps: boolean
  playbackMode: PlaybackMode
  playbackFpsCap: boolean
  fieldZoom: number
  showNoteCounter: boolean
  railColoring: RailColoring
  liveKeyLayout: LiveKeyLayout
  rhythmColoring: boolean
  hitSounds: boolean
  metronome: boolean
  musicVolume: number
  theme: Theme

  setPlaying: (playing: boolean) => void
  setCurrentTime: (ms: number) => void
  setSelection: (sel: Selection | null) => void
  setShowColumnDividers: (show: boolean) => void
  setShowRowLines: (show: boolean) => void
  setActiveSkin: (skin: string) => void
  setShowFps: (show: boolean) => void
  setPlaybackMode: (mode: PlaybackMode) => void
  setPlaybackFpsCap: (on: boolean) => void
  setFieldZoom: (zoom: number) => void
  setShowNoteCounter: (show: boolean) => void
  setRailColoring: (mode: RailColoring) => void
  setLiveKeyLayout: (layout: LiveKeyLayout) => void
  setRhythmColoring: (on: boolean) => void
  setHitSounds: (on: boolean) => void
  setMetronome: (on: boolean) => void
  setMusicVolume: (v: number) => void
  setTheme: (theme: Theme) => void
}

const _view = loadViewSettings()

export const useEditorStore = create<EditorStore>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  selection: null,
  showColumnDividers: _view.showColumnDividers,
  showRowLines: _view.showRowLines,
  activeSkin: _view.activeSkin,
  showFps: _view.showFps,
  playbackMode: _view.playbackMode,
  playbackFpsCap: _view.playbackFpsCap,
  fieldZoom: _view.fieldZoom,
  showNoteCounter: _view.showNoteCounter,
  railColoring: _view.railColoring,
  liveKeyLayout: _view.liveKeyLayout,
  rhythmColoring: _view.rhythmColoring,
  hitSounds: _view.hitSounds,
  metronome: _view.metronome,
  musicVolume: _view.musicVolume,
  theme: loadTheme(),

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setSelection: (selection) => set({ selection }),
  setShowColumnDividers: (showColumnDividers) => { set({ showColumnDividers }); persistView(get) },
  setShowRowLines: (showRowLines) => { set({ showRowLines }); persistView(get) },
  setActiveSkin: (activeSkin) => { set({ activeSkin }); persistView(get) },
  setShowFps: (showFps) => { set({ showFps }); persistView(get) },
  setPlaybackMode: (playbackMode) => { set({ playbackMode }); persistView(get) },
  setPlaybackFpsCap: (playbackFpsCap) => { set({ playbackFpsCap }); persistView(get) },
  setFieldZoom: (zoom) => { set({ fieldZoom: clampFieldZoom(zoom) }); persistView(get) },
  setShowNoteCounter: (showNoteCounter) => { set({ showNoteCounter }); persistView(get) },
  setRailColoring: (railColoring) => { set({ railColoring }); persistView(get) },
  setLiveKeyLayout: (liveKeyLayout) => { set({ liveKeyLayout }); persistView(get) },
  setRhythmColoring: (rhythmColoring) => { set({ rhythmColoring }); persistView(get) },
  setHitSounds: (hitSounds) => { set({ hitSounds }); persistView(get) },
  setMetronome: (metronome) => { set({ metronome }); persistView(get) },
  setMusicVolume: (musicVolume) => { set({ musicVolume }); persistView(get) },
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
}))

function persistView(get: () => EditorStore): void {
  const { showColumnDividers, showRowLines, activeSkin, showFps, playbackMode, playbackFpsCap, fieldZoom, showNoteCounter, railColoring, liveKeyLayout, rhythmColoring, hitSounds, metronome, musicVolume } = get()
  saveViewSettings({ showColumnDividers, showRowLines, activeSkin, showFps, playbackMode, playbackFpsCap, fieldZoom, showNoteCounter, railColoring, liveKeyLayout, rhythmColoring, hitSounds, metronome, musicVolume })
}
