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

// Окраска ритм-секций через одну: none — нет, mono — белый/слегка затемнённый,
// color — чередование голубого с оранжевым.
export type RailColoring = 'none' | 'mono' | 'color'
const RAIL_COLORINGS: RailColoring[] = ['none', 'mono', 'color']

// Выравнивание области редактирования (поле+рельса) в свободном пространстве
// вьюпорта: left — прижато влево (классика StepEdit Lite), center — по центру.
// Комбо-оверлей (счётчик нот) сдвигается вместе с полем.
export type FieldAlign = 'left' | 'center'
const FIELD_ALIGNS: FieldAlign[] = ['left', 'center']

// Тинт через одну [чётный, нечётный]. Полупрозрачные — корректны на светлой и тёмной
// теме; применяются и к рейлу, и к фону поля редактора. undefined = базовый фон.
const SECTION_TINTS: Record<RailColoring, [string | undefined, string | undefined]> = {
  none: [undefined, undefined],
  mono: [undefined, 'rgba(128,128,128,0.14)'],
  color: ['rgba(96,165,250,0.20)', 'rgba(251,146,60,0.20)'],
}

export function sectionTint(mode: RailColoring, index: number): string | undefined {
  return SECTION_TINTS[mode][index % 2]
}

// Зум размера поля в процентах: равномерно увеличивает ноты/колонки, хит-линию И
// расстояние между строками (множитель к per-tab scale). 50–300, шаг 10.
export const FIELD_ZOOM_MIN = 50
export const FIELD_ZOOM_MAX = 300
export const FIELD_ZOOM_STEP = 10

export interface ViewSettings {
  showColumnDividers: boolean
  showRowLines: boolean
  activeSkin: string
  showFps: boolean
  playbackMode: PlaybackMode
  // Кап рендера playback на 60 FPS: на high-refresh дисплеях (ProMotion 120Гц)
  // RAF рисует 120 кадров/с, и при записи видео 60 fps захват попадает то на
  // «чётный», то на «нечётный» кадр — видны биения. С капом рисуем каждый
  // второй кадр, движение в 60fps-записи ровное.
  playbackFpsCap: boolean
  fieldZoom: number
  fieldAlign: FieldAlign
  showNoteCounter: boolean
  railColoring: RailColoring
  rhythmColoring: boolean
  hitSounds: boolean
  metronome: boolean
  musicVolume: number
  // Компенсация задержки звукового тракта (Bluetooth-наушники и т.п.), мс.
  // Положительное значение = звук слышен позже, чем «логическая» позиция трека:
  // на столько же назад сдвигается прокрутка нот при playback (usePlayback) и
  // вычисление целевой строки при live-записи с клавиатуры (ChartEditor) — оба
  // места используют звук как источник времени, поэтому оба нуждаются в сдвиге.
  // Хит-саунды/метроном не трогаем: они идут через тот же аудио-выход, что и
  // музыка, и остаются синхронны с ней независимо от офсета.
  audioOffsetMs: number
}

const DEFAULTS: ViewSettings = {
  showColumnDividers: false,
  showRowLines: true,
  activeSkin: 'basic',
  showFps: false,
  playbackMode: 'snap',
  playbackFpsCap: false,
  fieldZoom: 100,
  fieldAlign: 'left',
  showNoteCounter: false,
  railColoring: 'none',
  rhythmColoring: false,
  hitSounds: false,
  metronome: false,
  musicVolume: 1,
  audioOffsetMs: 0,
}

export const AUDIO_OFFSET_MIN = -500
export const AUDIO_OFFSET_MAX = 500
export const AUDIO_OFFSET_STEP = 5

export function clampVolume(v: unknown): number {
  if (typeof v !== 'number' || !isFinite(v)) return DEFAULTS.musicVolume
  return Math.min(1, Math.max(0, v))
}

export function clampAudioOffset(v: unknown): number {
  if (typeof v !== 'number' || !isFinite(v)) return DEFAULTS.audioOffsetMs
  return Math.min(AUDIO_OFFSET_MAX, Math.max(AUDIO_OFFSET_MIN, Math.round(v)))
}

export function clampFieldZoom(z: unknown): number {
  if (typeof z !== 'number' || !isFinite(z)) return DEFAULTS.fieldZoom
  const snapped = Math.round(z / FIELD_ZOOM_STEP) * FIELD_ZOOM_STEP
  return Math.min(FIELD_ZOOM_MAX, Math.max(FIELD_ZOOM_MIN, snapped))
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
      playbackFpsCap:
        typeof parsed.playbackFpsCap === 'boolean' ? parsed.playbackFpsCap : DEFAULTS.playbackFpsCap,
      fieldZoom: clampFieldZoom(parsed.fieldZoom),
      fieldAlign: FIELD_ALIGNS.includes(parsed.fieldAlign as FieldAlign)
        ? (parsed.fieldAlign as FieldAlign)
        : DEFAULTS.fieldAlign,
      showNoteCounter: typeof parsed.showNoteCounter === 'boolean' ? parsed.showNoteCounter : DEFAULTS.showNoteCounter,
      railColoring: RAIL_COLORINGS.includes(parsed.railColoring as RailColoring)
        ? (parsed.railColoring as RailColoring)
        : DEFAULTS.railColoring,
      rhythmColoring:
        typeof parsed.rhythmColoring === 'boolean' ? parsed.rhythmColoring : DEFAULTS.rhythmColoring,
      hitSounds: typeof parsed.hitSounds === 'boolean' ? parsed.hitSounds : DEFAULTS.hitSounds,
      metronome: typeof parsed.metronome === 'boolean' ? parsed.metronome : DEFAULTS.metronome,
      musicVolume: clampVolume(parsed.musicVolume),
      audioOffsetMs: clampAudioOffset(parsed.audioOffsetMs),
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
