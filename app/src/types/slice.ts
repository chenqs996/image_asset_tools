export type SliceMode = 'fixed_size' | 'fixed_count' | 'line_detect'

export interface SliceConfig {
  mode: SliceMode
  sliceWidth: number
  sliceHeight: number
  countX: number
  countY: number
  offsetX: number
  offsetY: number
  linesX: number[]
  linesY: number[]
}

export interface SliceGridResult {
  tileWidth: number
  tileHeight: number
  cols: number
  rows: number
  total: number
}

export const DEFAULT_SLICE_CONFIG: SliceConfig = {
  mode: 'fixed_size',
  sliceWidth: 256,
  sliceHeight: 256,
  countX: 4,
  countY: 4,
  offsetX: 0,
  offsetY: 0,
  linesX: [],
  linesY: [],
}
