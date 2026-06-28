import type { SliceConfig, SliceGridResult } from '../types/slice'

export interface SliceRect {
  index: number
  x: number
  y: number
  width: number
  height: number
}

function safePositive(value: number, fallback = 1) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value))
}

export function calculateSliceGrid(
  imageWidth: number,
  imageHeight: number,
  config: SliceConfig,
): SliceGridResult {
  const offsetX = Math.max(0, Math.floor(config.offsetX))
  const offsetY = Math.max(0, Math.floor(config.offsetY))
  const availableWidth = Math.max(1, imageWidth - offsetX)
  const availableHeight = Math.max(1, imageHeight - offsetY)

  if (config.mode === 'fixed_count') {
    const cols = safePositive(config.countX)
    const rows = safePositive(config.countY)
    const tileWidth = Math.ceil(availableWidth / cols)
    const tileHeight = Math.ceil(availableHeight / rows)
    return {
      tileWidth,
      tileHeight,
      cols,
      rows,
      total: cols * rows,
    }
  }

  if (config.mode === 'line_detect') {
    const uniqueX = Array.from(new Set(config.linesX.map((n) => Math.floor(n))))
      .filter((n) => n > 0 && n < imageWidth)
      .sort((a, b) => a - b)
    const uniqueY = Array.from(new Set(config.linesY.map((n) => Math.floor(n))))
      .filter((n) => n > 0 && n < imageHeight)
      .sort((a, b) => a - b)

    const cols = Math.max(1, uniqueX.length + 1)
    const rows = Math.max(1, uniqueY.length + 1)
    const tileWidth = Math.ceil(availableWidth / cols)
    const tileHeight = Math.ceil(availableHeight / rows)

    return {
      tileWidth,
      tileHeight,
      cols,
      rows,
      total: cols * rows,
    }
  }

  const tileWidth = safePositive(config.sliceWidth)
  const tileHeight = safePositive(config.sliceHeight)
  const cols = Math.max(1, Math.ceil(availableWidth / tileWidth))
  const rows = Math.max(1, Math.ceil(availableHeight / tileHeight))

  return {
    tileWidth,
    tileHeight,
    cols,
    rows,
    total: cols * rows,
  }
}

export function generateSliceRects(
  imageWidth: number,
  imageHeight: number,
  config: SliceConfig,
): SliceRect[] {
  const grid = calculateSliceGrid(imageWidth, imageHeight, config)
  const offsetX = Math.max(0, Math.floor(config.offsetX))
  const offsetY = Math.max(0, Math.floor(config.offsetY))

  if (config.mode === 'line_detect') {
    const cutsX = [
      offsetX,
      ...Array.from(new Set(config.linesX.map((n) => Math.floor(n))))
        .filter((n) => n > offsetX && n < imageWidth)
        .sort((a, b) => a - b),
      imageWidth,
    ]
    const cutsY = [
      offsetY,
      ...Array.from(new Set(config.linesY.map((n) => Math.floor(n))))
        .filter((n) => n > offsetY && n < imageHeight)
        .sort((a, b) => a - b),
      imageHeight,
    ]

    const rects: SliceRect[] = []
    let index = 1
    for (let row = 0; row < cutsY.length - 1; row += 1) {
      for (let col = 0; col < cutsX.length - 1; col += 1) {
        const x = cutsX[col]
        const y = cutsY[row]
        const width = cutsX[col + 1] - x
        const height = cutsY[row + 1] - y
        rects.push({ index, x, y, width, height })
        index += 1
      }
    }
    return rects
  }

  const rects: SliceRect[] = []
  let index = 1

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const x = offsetX + col * grid.tileWidth
      const y = offsetY + row * grid.tileHeight

      rects.push({
        index,
        x,
        y,
        width: Math.min(grid.tileWidth, Math.max(0, imageWidth - x)),
        height: Math.min(grid.tileHeight, Math.max(0, imageHeight - y)),
      })
      index += 1
    }
  }

  return rects
}
