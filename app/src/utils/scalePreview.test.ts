import { describe, expect, it } from 'vitest'
import { buildScalePreview } from './scalePreview'

describe('scalePreview utils', () => {
  it('marks upscale ratio as blocked', () => {
    const result = buildScalePreview(100, 100, {
      mode: 'ratio',
      ratiosText: '2,0.5',
      targetWidth: 0,
      targetHeight: 0,
      keepAspect: true,
      downscaleOnly: true,
    })

    expect(result[0].blocked).toBe(true)
    expect(result[1].blocked).toBe(false)
    expect(result[1].width).toBe(50)
  })

  it('calculates target mode with keepAspect', () => {
    const result = buildScalePreview(1920, 1080, {
      mode: 'target',
      ratiosText: '',
      targetWidth: 800,
      targetHeight: 800,
      keepAspect: true,
      downscaleOnly: true,
    })

    expect(result[0].width).toBe(800)
    expect(result[0].height).toBe(450)
    expect(result[0].blocked).toBe(false)
  })
})
