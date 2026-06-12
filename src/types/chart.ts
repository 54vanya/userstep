export type NoteType = 'tap' | 'hold'
export type ChartMode = 'Single' | 'Double'

export interface Note {
  row: number
  col: number
  type: NoteType
  endRow?: number
  /** True when this hold is a continuation from the previous block (no arrow head) */
  continued?: boolean
  /** True when this hold continues into the next block (no cap at end) */
  continues?: boolean
}

export interface Block {
  id: string
  bpm: number
  delay: number
  beat: number
  split: number
  measures: number
  notes: Note[]
  /** Actual row count when it differs from beat*split*measures (e.g. UCS import with non-integer measures) */
  rowCount?: number
}

export interface EditorSettings {
  scale: number
  playbackRate: number
  currentTime: number
}

export interface Chart {
  id: string
  version: number
  meta: { title: string; artist: string }
  chartType: ChartMode
  difficulty: number
  blocks: Block[]
  audioFileName?: string
  editorSettings?: EditorSettings
}

export interface Tab {
  id: string
  chart: Chart
  audioBlob?: Blob
  isDirty: boolean
  filePath?: string
  label: string
  scale: number
  playbackRate: number
  isBlank?: boolean
}

export interface EditorState {
  scale: number
  activeBlockId: string | null
  scrollY: number
  isPlaying: boolean
  currentTime: number
}

export interface BlockOffset {
  blockId: string
  startMs: number
  msPerRow: number
}
