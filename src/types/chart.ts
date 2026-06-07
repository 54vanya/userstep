export type NoteType = 'tap' | 'hold'
export type ChartMode = 'Single' | 'Double'

export interface Note {
  row: number
  col: number
  type: NoteType
  endRow?: number
}

export interface Block {
  id: string
  bpm: number
  delay: number
  beat: number
  split: number
  measures: number
  notes: Note[]
}

export interface Chart {
  id: string
  version: number
  meta: { title: string; artist: string }
  chartType: ChartMode
  difficulty: number
  blocks: Block[]
  audioFileName?: string
}

export interface Tab {
  id: string
  chart: Chart
  audioBlob?: Blob
  isDirty: boolean
  filePath?: string
  label: string
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
