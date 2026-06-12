import type { Block } from '@/types/chart'

export const COLUMN_WIDTH = 40
export const BASE_BEAT_HEIGHT = 32
export const BLOCK_DIVIDER_HEIGHT = 0
export const CURSOR_LINE_Y = 40
export const LABEL_WIDTH = 64
export const RAIL_WIDTH = 64

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

export function blockRowCount(block: Block): number {
  return block.rowCount ?? (block.beat * block.split * block.measures)
}

export function blockPixelHeight(block: Block, scale: number): number {
  return blockRowCount(block) * rowHeight(scale, block.split)
}

export function pixelToRow(py: number, scale: number, split: number): number {
  return Math.floor(py / rowHeight(scale, split))
}

export function pixelToCol(px: number): number {
  return Math.floor(px / COLUMN_WIDTH)
}
