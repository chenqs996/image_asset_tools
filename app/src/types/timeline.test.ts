import { describe, expect, it } from 'vitest'
import { moveFrame } from './timeline'

describe('timeline moveFrame', () => {
  it('moves one frame index to another', () => {
    const next = moveFrame(['a', 'b', 'c', 'd'], 1, 3)
    expect(next).toEqual(['a', 'c', 'd', 'b'])
  })

  it('returns original when index invalid', () => {
    const origin = ['a', 'b']
    const next = moveFrame(origin, -1, 1)
    expect(next).toEqual(origin)
  })
})
