import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editorStore'
import { audioEngine } from '@/services/audioEngine'
import { computeBlockOffsets, msToScrollY } from '@/utils/timing'
import type { BlockLayout } from '@/utils/geometry'
import type { Block } from '@/types/chart'

export function usePlayback(
  blocks: Block[],
  blockLayouts: BlockLayout[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const { isPlaying, setPlaying, setCurrentTime, setScrollY } = useEditorStore()
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const onEnd = () => setPlaying(false)
    audioEngine.on('end', onEnd)
    return () => audioEngine.off('end', onEnd)
  }, [setPlaying])

  useEffect(() => {
    if (!isPlaying) return

    const offsets = computeBlockOffsets(blocks)

    const tick = () => {
      const ms = audioEngine.getCurrentMs()
      setCurrentTime(ms)
      const y = msToScrollY(ms, offsets, blockLayouts)
      setScrollY(y)
      if (scrollRef.current) scrollRef.current.scrollTop = y
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, blocks, blockLayouts, scrollRef, setCurrentTime, setScrollY])
}
