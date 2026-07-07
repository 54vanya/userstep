import { audioEngine } from './audioEngine'
import { useEditorStore } from '@/store/editorStore'

// Единый play/pause для Space (ChartEditor) и кнопки тулбара: позиция снимается
// с аудио-часов ДО pause(), иначе курсор откатывался бы к точке старта.
export function togglePlayback(): void {
  if (!audioEngine.hasAudio()) return
  const ed = useEditorStore.getState()
  if (ed.isPlaying) {
    const pausedAt = audioEngine.getCurrentMs()
    audioEngine.pause()
    ed.setPlaying(false)
    ed.setCurrentTime(pausedAt)
  } else {
    audioEngine.play(ed.currentTime)
    ed.setPlaying(true)
  }
}
