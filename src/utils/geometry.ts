import type { Block } from '@/types/chart'

export const COLUMN_WIDTH = 40
export const BASE_BEAT_HEIGHT = 32
export const BLOCK_DIVIDER_HEIGHT = 4

export interface BlockLayout {
  block: Block
  startY: number
  endY: number
  rh: number
  totalRows: number
}

export function rowHeight(scale: number, split: number): number {
  return (BASE_BEAT_HEIGHT * scale) / split
}

export function blockPixelHeight(block: Block, scale: number): number {
  return block.beat * block.split * block.measures * rowHeight(scale, block.split)
}

export function pixelToRow(py: number, scale: number, split: number): number {
  return Math.floor(py / rowHeight(scale, split))
}

export function pixelToCol(px: number): number {
  return Math.floor(px / COLUMN_WIDTH)
}
