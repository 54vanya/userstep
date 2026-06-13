// Глобальные view-настройки меню (не привязаны к табу): сохраняются в localStorage
// отдельно от сессии табов и темы.
const KEY = 'piu-view-settings'

// Способ ведения движения конвейера во время воспроизведения (см. usePlayback):
// snap     — как smooth, но сетка контр-трансформом ложится на физический пиксель
//            (дефолт): убирает сабпиксельный шиммер тонких 1px-линий — главный
//            источник видимого «дёрганья» при идеальном fps
// smooth   — гладкая RAF-шкала + low-pass подтяжка к аудио (ноты гладкие, сетка шиммерит)
// framelock — фикс. шаг refresh×rate за кадр, мягкий ресинк
// raw      — позиция берётся прямо из аудио-часов каждый кадр (baseline, «лесенка»)
export type PlaybackMode = 'smooth' | 'framelock' | 'snap' | 'raw'
const PLAYBACK_MODES: PlaybackMode[] = ['snap', 'smooth', 'framelock', 'raw']

export interface ViewSettings {
  showColumnDividers: boolean
  showRowLines: boolean
  activeSkin: string
  showFps: boolean
  playbackMode: PlaybackMode
}

const DEFAULTS: ViewSettings = {
  showColumnDividers: false,
  showRowLines: true,
  activeSkin: 'basic',
  showFps: false,
  playbackMode: 'snap',
}

export function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<ViewSettings>
    return {
      showColumnDividers:
        typeof parsed.showColumnDividers === 'boolean' ? parsed.showColumnDividers : DEFAULTS.showColumnDividers,
      showRowLines: typeof parsed.showRowLines === 'boolean' ? parsed.showRowLines : DEFAULTS.showRowLines,
      activeSkin: typeof parsed.activeSkin === 'string' ? parsed.activeSkin : DEFAULTS.activeSkin,
      showFps: typeof parsed.showFps === 'boolean' ? parsed.showFps : DEFAULTS.showFps,
      playbackMode: PLAYBACK_MODES.includes(parsed.playbackMode as PlaybackMode)
        ? (parsed.playbackMode as PlaybackMode)
        : DEFAULTS.playbackMode,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveViewSettings(settings: ViewSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* QuotaExceededError — игнорируем */
  }
}
