import { describe, expect, it } from 'vitest'
import { calculateSliceGrid, generateSliceRects } from './sliceGrid'

describe('sliceGrid utils', () => {
  it('calculates fixed_size grid correctly', () => {
    const grid = calculateSliceGrid(1024, 768, {
      mode: 'fixed_size',
      sliceWidth: 256,
      sliceHeight: 192,
      countX: 0,
      countY: 0,
      offsetX: 0,
      offsetY: 0,
      linesX: [],
      linesY: [],
    })

    expect(grid.cols).toBe(4)
    expect(grid.rows).toBe(4)
    expect(grid.total).toBe(16)
  })

  it('calculates fixed_count grid correctly', () => {
    const grid = calculateSliceGrid(1000, 700, {
      mode: 'fixed_count',
      sliceWidth: 0,
      sliceHeight: 0,
      countX: 5,
      countY: 7,
      offsetX: 0,
      offsetY: 0,
      linesX: [],
      linesY: [],
    })

    expect(grid.tileWidth).toBe(200)
    expect(grid.tileHeight).toBe(100)
    expect(grid.total).toBe(35)
  })

  it('generates line_detect rects according to line cuts', () => {
    const rects = generateSliceRects(100, 100, {
      mode: 'line_detect',
      sliceWidth: 0,
      sliceHeight: 0,
      countX: 0,
      countY: 0,
      offsetX: 0,
      offsetY: 0,
      linesX: [30, 60],
      linesY: [50],
    })

    expect(rects.length).toBe(6)
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 30, height: 50 })
    expect(rects[5]).toMatchObject({ x: 60, y: 50, width: 40, height: 50 })
  })
})
